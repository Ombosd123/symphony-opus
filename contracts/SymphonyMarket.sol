// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Interface ERC-20 minimal (USDT, 18 desimal).
interface IERC20Mkt {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @notice Interface registry Agent ID resmi. Gate = balanceOf > 0.
interface IAgentIdRegistryMkt {
    function balanceOf(address owner) external view returns (uint256);
}

/// @notice Interface NFT yang bisa diperdagangkan (SymphonyPass &
///         Opus Magnum di Soundcheck): transfer hanya oleh market ini.
interface ITradableNFT {
    function ownerOf(uint256 tokenId) external view returns (address);
    function transferFrom(address from, address to, uint256 tokenId) external;
}

/// @notice Interface SymphonyPass (lantai harga dari paidOf on-chain;
///         sale() = alamat kontrak sale yang terikat padanya).
interface IPassForMarket is ITradableNFT {
    function paidOf(uint256 tokenId) external view returns (uint256);
    function sale() external view returns (address);
}

/// @notice Interface SymphonySale (gerbang buka market: habis terjual).
interface ISaleForMarket {
    function totalSold() external view returns (uint256);
    function TOTAL_PASSES() external view returns (uint256);
}

/// @title SymphonyMarket — market escrow resmi SYMPHONY
/// @notice SPEC-SYMPHONY.md bagian 7 & 10 (fase 2):
///         - Hanya dua aset: Symphony Pass yang BELUM diklaim (Pass di
///           escrow market tidak bisa dibakar pemiliknya — kepemilikan
///           ada di kontrak ini selama terdaftar) dan Opus Magnum.
///           Badge milestone Soundcheck tidak pernah bisa diperdagangkan
///           (transfernya revert di kontrak Soundcheck sendiri).
///         - Umur market (amendemen 2026-11-27): market hanya aktif
///           SETELAH sale habis terjual (totalSold == TOTAL_PASSES =
///           5.000, dibaca langsung dari kontrak sale lewat
///           SymphonyPass.sale) dan sebelum vonis (30 Des 2026
///           12:00 UTC). Selama sale belum habis, market TERTUTUP —
///           tidak ada listing yang dapat memotong harga tier primer
///           (klaim semua Pass sama: 68.100 OPUS, jadi Pass murah
///           dari tier awal akan selalu mengalahkan tier berjalan).
///           Bila sale gagal, market tidak pernah terbuka. Pada vonis
///           market TUTUP pada kedua hasil: listing tidak bisa lagi
///           dibeli; penjual menarik kembali NFT-nya (pola pull —
///           "listing kembali ke penjual"); klaim/refund mengikuti
///           pemegang terakhir lewat kontrak sale.
///         - Harga bebas oleh penjual; Pass berlantai 80% dari paidOf
///           on-chain (T1 ≥0,8 · T2 ≥1,2 · T3 ≥1,6 USDT). Magnum bebas.
///         - Fee 5% dari HASIL PENJUAL, hanya saat laku → TreasuryVault;
///           penjual menerima 95%. Pembayaran USDT.
///         - Pembeli WAJIB pemegang Agent ID (gate di pintu masuk
///           market, SPEC 9). Batas 10/wallet TIDAK berlaku di sini
///           (hanya pembelian primer di kontrak sale).
///         - NFT dipegang kontrak ini selama listing (escrow sungguhan):
///           list() memindahkan NFT penjual → kontrak ini lewat
///           transferFrom yang hanya bisa dipanggil market.
///         Kontrak IMMUTABLE: tanpa owner-withdraw / pause / upgrade.
contract SymphonyMarket {
    uint8 public constant KIND_PASS = 1;
    uint8 public constant KIND_MAGNUM = 2;
    /// @notice Fee market: 5% dari hasil penjual.
    uint256 public constant FEE_PERCENT = 5;
    /// @notice Lantai harga Pass: 80% dari paidOf.
    uint256 public constant FLOOR_PERCENT = 80;

    IAgentIdRegistryMkt public immutable registry;
    IERC20Mkt public immutable usdt;
    address public immutable treasuryVault;
    IPassForMarket public immutable pass;
    ITradableNFT public immutable soundcheck;
    /// @notice Batas waktu market (unix). Produksi: batas awal
    ///         1797076800 (12 Des 2026 12:00 UTC, awal sale — market
    ///         tetap tertutup sampai sale habis terjual), tutup
    ///         1798632000 (vonis, 30 Des 2026 12:00 UTC).
    uint256 public immutable marketOpen;
    uint256 public immutable marketClose;

    struct Listing {
        address seller;
        uint8 kind;
        uint256 tokenId;
        uint256 price;
        bool active;
    }

    uint256 private _nextListingId = 1;
    mapping(uint256 => Listing) public listings;

    event Listed(uint256 indexed listingId, address indexed seller, uint8 kind, uint256 tokenId, uint256 price);
    event Delisted(uint256 indexed listingId, address indexed seller, uint8 kind, uint256 tokenId);
    event Sold(uint256 indexed listingId, address indexed buyer, address indexed seller, uint8 kind, uint256 tokenId, uint256 price, uint256 fee);

    constructor(
        address registry_,
        address usdt_,
        address treasuryVault_,
        address pass_,
        address soundcheck_,
        uint256 marketOpen_,
        uint256 marketClose_
    ) {
        require(registry_ != address(0), "SymphonyMarket: registry zero address");
        require(usdt_ != address(0), "SymphonyMarket: usdt zero address");
        require(treasuryVault_ != address(0), "SymphonyMarket: vault zero address");
        require(pass_ != address(0), "SymphonyMarket: pass zero address");
        require(soundcheck_ != address(0), "SymphonyMarket: soundcheck zero address");
        require(marketOpen_ < marketClose_, "SymphonyMarket: bad window");
        registry = IAgentIdRegistryMkt(registry_);
        usdt = IERC20Mkt(usdt_);
        treasuryVault = treasuryVault_;
        pass = IPassForMarket(pass_);
        soundcheck = ITradableNFT(soundcheck_);
        marketOpen = marketOpen_;
        marketClose = marketClose_;
    }

    /// @notice True bila sale sudah habis terjual. Alamat sale dibaca
    ///         dari SymphonyPass (terikat satu kali oleh deployer);
    ///         belum terikat → belum habis (fail closed).
    function soldOut() public view returns (bool) {
        address saleAddr = pass.sale();
        if (saleAddr == address(0)) return false;
        ISaleForMarket sale = ISaleForMarket(saleAddr);
        return sale.totalSold() >= sale.TOTAL_PASSES();
    }

    /// @notice True selama jendela perdagangan market: sale sudah
    ///         habis terjual dan vonis belum tiba.
    function isOpen() public view returns (bool) {
        return block.timestamp >= marketOpen && block.timestamp < marketClose && soldOut();
    }

    /// @notice Lantai harga Pass ini = 80% paidOf on-chain.
    function floorOf(uint256 tokenId) public view returns (uint256) {
        return (pass.paidOf(tokenId) * FLOOR_PERCENT) / 100;
    }

    // ------------------------------------------------------------------
    // Listing (NFT masuk escrow kontrak ini)
    // ------------------------------------------------------------------
    /// @notice Daftarkan Pass untuk dijual. Harga ≥ lantai 80% paidOf.
    function listPass(uint256 tokenId, uint256 price) external returns (uint256 listingId) {
        require(isOpen(), "SymphonyMarket: market closed");
        require(price >= floorOf(tokenId), "SymphonyMarket: price below floor");
        require(pass.ownerOf(tokenId) == msg.sender, "SymphonyMarket: not the holder");
        pass.transferFrom(msg.sender, address(this), tokenId);
        listingId = _createListing(KIND_PASS, tokenId, price);
    }

    /// @notice Daftarkan Opus Magnum untuk dijual. Harga bebas (> 0).
    function listMagnum(uint256 tokenId, uint256 price) external returns (uint256 listingId) {
        require(isOpen(), "SymphonyMarket: market closed");
        require(price > 0, "SymphonyMarket: zero price");
        require(soundcheck.ownerOf(tokenId) == msg.sender, "SymphonyMarket: not the holder");
        soundcheck.transferFrom(msg.sender, address(this), tokenId);
        listingId = _createListing(KIND_MAGNUM, tokenId, price);
    }

    function _createListing(uint8 kind, uint256 tokenId, uint256 price) internal returns (uint256 listingId) {
        listingId = _nextListingId++;
        listings[listingId] = Listing({
            seller: msg.sender,
            kind: kind,
            tokenId: tokenId,
            price: price,
            active: true
        });
        emit Listed(listingId, msg.sender, kind, tokenId, price);
    }

    // ------------------------------------------------------------------
    // Pembelian
    // ------------------------------------------------------------------
    /// @notice Beli listing: pembeli wajib Agent ID; USDT pembeli →
    ///         95% penjual + 5% fee ke TreasuryVault; NFT escrow →
    ///         pembeli. Hanya selama jendela market.
    function buy(uint256 listingId) external {
        require(isOpen(), "SymphonyMarket: market closed");
        Listing storage l = listings[listingId];
        require(l.active, "SymphonyMarket: listing not active");
        require(registry.balanceOf(msg.sender) > 0, "SymphonyMarket: not an Agent ID holder");
        require(msg.sender != l.seller, "SymphonyMarket: cannot buy own listing");
        l.active = false;
        uint256 fee = (l.price * FEE_PERCENT) / 100;
        uint256 sellerProceeds = l.price - fee;
        require(
            usdt.transferFrom(msg.sender, l.seller, sellerProceeds),
            "SymphonyMarket: payment to seller failed"
        );
        if (fee > 0) {
            require(
                usdt.transferFrom(msg.sender, treasuryVault, fee),
                "SymphonyMarket: fee transfer failed"
            );
        }
        _nftOf(l.kind).transferFrom(address(this), msg.sender, l.tokenId);
        emit Sold(listingId, msg.sender, l.seller, l.kind, l.tokenId, l.price, fee);
    }

    // ------------------------------------------------------------------
    // Penarikan oleh penjual (delist / reclaim setelah tutup)
    // ------------------------------------------------------------------
    /// @notice Tarik kembali NFT yang belum laku — kapan pun sebelum
    ///         terjual, termasuk setelah market tutup pada vonis
    ///         (listing kembali ke penjual, SPEC 7). Hanya penjual.
    function cancel(uint256 listingId) external {
        Listing storage l = listings[listingId];
        require(l.active, "SymphonyMarket: listing not active");
        require(msg.sender == l.seller, "SymphonyMarket: not the seller");
        l.active = false;
        _nftOf(l.kind).transferFrom(address(this), l.seller, l.tokenId);
        emit Delisted(listingId, l.seller, l.kind, l.tokenId);
    }

    function _nftOf(uint8 kind) internal view returns (ITradableNFT) {
        return kind == KIND_PASS ? ITradableNFT(address(pass)) : soundcheck;
    }
}
