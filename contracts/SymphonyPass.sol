// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SymphonyPass — NFT Mint Pass SYMPHONY (Rhapsody No. 1)
/// @notice SPEC-SYMPHONY.md bagian 5, 7, 9 & 10 (fase 2):
///         - ERC-721 yang diterbitkan HANYA oleh SymphonySale (di-bind
///           satu kali oleh deployer, pola bind Soundcheck fase 1).
///           Setiap Pass mencatat tierOf (1/2/3) + paidOf (USDT yang
///           dibayar, 18 desimal) secara on-chain saat mint — paidOf
///           adalah dasar lantai harga market (80%) dan jumlah refund.
///         - SEMI-SOULBOUND: semua transfer bebas revert. Satu-satunya
///           jalur perpindahan adalah transferFrom yang dipanggil OLEH
///           kontrak SymphonyMarket yang ter-bind (pola escrow yang
///           sama dengan Opus Magnum di Soundcheck). Approval hanya
///           untuk market yang ter-bind.
///         - burn(tokenId): hanya oleh kontrak sale (jalur burn-to-claim
///           & burn-to-settle refund di SymphonySale, SPEC 9/10 — sale
///           memeriksa kepemilikan sebelum memanggil burn ini).
///         Kontrak IMMUTABLE: tanpa owner-withdraw / pause / upgrade;
///         hak istimewa hanya bindSale + bindMarket satu-kali oleh
///         deployer (masing-masing hanya menetapkan alamat).
contract SymphonyPass {
    string public constant name = "SYMPHONY Pass - Rhapsody No. 1";
    string public constant symbol = "PASS";

    /// @notice URI metadata Pass (di domain situs proyek, pola fase 1).
    ///         ASUMSI DEPLOY: kandidat domain symphony-opus.pages.dev —
    ///         ubah konstanta ini sebelum deploy bila domain final beda.
    string public constant PASS_METADATA_URI = "https://symphony-opus.pages.dev/pass.json";

    address public immutable deployer;
    address public sale;
    address public market;

    uint256 private _nextTokenId = 1;
    mapping(uint256 => address) private _ownerOf;
    /// @notice Tier Pass: 1 = Overture, 2 = Crescendo, 3 = Finale.
    mapping(uint256 => uint8) public tierOf;
    /// @notice USDT yang dibayar untuk Pass ini (18 desimal).
    mapping(uint256 => uint256) public paidOf;
    mapping(address => uint256) private _balances;
    mapping(uint256 => address) private _approval;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed spender, uint256 indexed tokenId);
    event PassMinted(address indexed to, uint256 tokenId, uint8 tier, uint256 paid);
    event PassBurned(address indexed from, uint256 tokenId);
    event SaleBound(address indexed sale);
    event MarketBound(address indexed market);

    constructor() {
        deployer = msg.sender;
    }

    // ------------------------------------------------------------------
    // Binding satu-kali oleh deployer
    // ------------------------------------------------------------------
    function bindSale(address sale_) external {
        require(msg.sender == deployer, "SymphonyPass: not the deployer");
        require(sale == address(0), "SymphonyPass: sale already bound");
        require(sale_ != address(0), "SymphonyPass: sale zero address");
        sale = sale_;
        emit SaleBound(sale_);
    }

    function bindMarket(address market_) external {
        require(msg.sender == deployer, "SymphonyPass: not the deployer");
        require(market == address(0), "SymphonyPass: market already bound");
        require(market_ != address(0), "SymphonyPass: market zero address");
        market = market_;
        emit MarketBound(market_);
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------
    function balanceOf(address owner) external view returns (uint256) {
        require(owner != address(0), "SymphonyPass: zero address");
        return _balances[owner];
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        address owner = _ownerOf[tokenId];
        require(owner != address(0), "SymphonyPass: nonexistent token");
        return owner;
    }

    function totalMinted() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        require(_ownerOf[tokenId] != address(0), "SymphonyPass: nonexistent token");
        return PASS_METADATA_URI;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return
            interfaceId == 0x01ffc9a7 || // ERC-165
            interfaceId == 0x80ac58cd || // ERC-721
            interfaceId == 0x5b5e139f; // ERC-721 metadata
    }

    // ------------------------------------------------------------------
    // Mint & burn — hanya kontrak sale
    // ------------------------------------------------------------------
    /// @notice Terbitkan Pass baru. Hanya SymphonySale ter-bind.
    function mint(address to, uint8 tier, uint256 paid) external returns (uint256 tokenId) {
        require(msg.sender == sale, "SymphonyPass: only the sale");
        require(to != address(0), "SymphonyPass: mint to zero address");
        require(tier >= 1 && tier <= 3, "SymphonyPass: bad tier");
        tokenId = _nextTokenId++;
        _ownerOf[tokenId] = to;
        tierOf[tokenId] = tier;
        paidOf[tokenId] = paid;
        _balances[to] += 1;
        emit Transfer(address(0), to, tokenId);
        emit PassMinted(to, tokenId, tier, paid);
    }

    /// @notice Bakar Pass (klaim / refund di SymphonySale). Hanya sale.
    function burn(uint256 tokenId) external {
        require(msg.sender == sale, "SymphonyPass: only the sale");
        address owner = _ownerOf[tokenId];
        require(owner != address(0), "SymphonyPass: nonexistent token");
        delete _ownerOf[tokenId];
        delete _approval[tokenId];
        _balances[owner] -= 1;
        emit Transfer(owner, address(0), tokenId);
        emit PassBurned(owner, tokenId);
    }

    // ------------------------------------------------------------------
    // Transfer — hanya lewat market resmi (escrow)
    // ------------------------------------------------------------------
    function approve(address spender, uint256 tokenId) external {
        require(_ownerOf[tokenId] == msg.sender, "SymphonyPass: not the holder");
        require(market != address(0) && spender == market, "SymphonyPass: only the official market");
        _approval[tokenId] = spender;
        emit Approval(msg.sender, spender, tokenId);
    }

    function setApprovalForAll(address, bool) external pure {
        revert("SymphonyPass: approvals disabled");
    }

    function getApproved(uint256 tokenId) external view returns (address) {
        require(_ownerOf[tokenId] != address(0), "SymphonyPass: nonexistent token");
        return _approval[tokenId];
    }

    function isApprovedForAll(address, address) external pure returns (bool) {
        return false;
    }

    function transferFrom(address from, address to, uint256 tokenId) external {
        _transferViaMarket(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        _transferViaMarket(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata) external {
        _transferViaMarket(from, to, tokenId);
    }

    /// @notice Satu-satunya jalur perpindahan: dipanggil OLEH kontrak
    ///         market ter-bind, dari holder saat ini (escrow market).
    function _transferViaMarket(address from, address to, uint256 tokenId) internal {
        require(market != address(0), "SymphonyPass: market not bound yet");
        require(msg.sender == market, "SymphonyPass: only the official market");
        require(_ownerOf[tokenId] == from, "SymphonyPass: not the holder");
        require(to != address(0), "SymphonyPass: zero address");
        _ownerOf[tokenId] = to;
        _balances[from] -= 1;
        _balances[to] += 1;
        delete _approval[tokenId];
        emit Transfer(from, to, tokenId);
    }
}
