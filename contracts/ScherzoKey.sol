// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ScherzoKey — NFT kunci SCHERZO (kursi Season 2) SYMPHONY
/// @notice SPEC-SYMPHONY.md bagian 9, 10 & 13 (fase 2; amendemen
///         keputusan 2026-11-22):
///         - ERC-721 SOULBOUND PENUH: semua jalur transfer & approval
///           revert selamanya; tidak ada market, tidak ada burn. Kunci
///           tidak bisa dijual, dipindahkan, atau dimusnahkan siapa pun.
///         - Tepat SATU kunci per wallet, berapa pun Pass yang
///           di-Encore-kan wallet itu. Diterbitkan OTOMATIS oleh
///           SymphonySale di dalam transaksi burn Encore PERTAMA wallet
///           tersebut (mintKey hanya bisa dipanggil kontrak sale yang
///           di-bind satu kali oleh deployer — pola bind fase 1).
///         - Kunci ini adalah REGISTRY KANONIS kursi Overture (Tier 1)
///           yang terjamin di Scherzo — gerakan kedua · Season 2
///           (PLANNED) — BILA Scherzo dibuka. Scherzo tetap rencana,
///           bukan janji: tidak ada tanggal, angka, atau mekanik
///           Scherzo yang dijanjikan kunci ini. Kontrak sale tetap
///           mencatat scherzoOvertureSeats (hitungan Pass Encore per
///           alamat) sebagai bukti internalnya; yang dibaca kontrak
///           Season 2 kelak adalah kepemilikan kunci di sini.
///         Kontrak IMMUTABLE: tanpa owner-withdraw / pause / upgrade;
///         hak istimewa hanya bindSale satu-kali oleh deployer.
contract ScherzoKey {
    string public constant name = unicode"SCHERZO — Season 2 Seat Key";
    string public constant symbol = "SCHERZO";

    /// @notice URI metadata kunci (di domain situs proyek, pola fase 1).
    ///         ASUMSI DEPLOY: kandidat domain symphony-opus.pages.dev —
    ///         ubah konstanta ini sebelum deploy bila domain final beda.
    string public constant KEY_METADATA_URI = "https://symphony-opus.pages.dev/scherzo-key.json";

    address public immutable deployer;
    /// @notice Kontrak SymphonySale yang ter-bind (satu kali, deployer).
    address public sale;

    uint256 private _nextTokenId = 1;
    mapping(uint256 => address) private _ownerOf;
    /// @notice keyOf[alamat] = tokenId kunci SCHERZO milik alamat itu
    ///         (0 = belum punya). Maksimal 1 per alamat, selamanya.
    mapping(address => uint256) public keyOf;
    /// @notice Jumlah kunci yang sudah diterbitkan.
    uint256 public totalKeys;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event KeyMinted(address indexed holder, uint256 tokenId);
    event SaleBound(address indexed sale);

    constructor() {
        deployer = msg.sender;
    }

    // ------------------------------------------------------------------
    // Binding satu-kali oleh deployer
    // ------------------------------------------------------------------
    /// @notice Bind kontrak SymphonySale — satu kali, hanya deployer.
    ///         Setelah ter-bind, hanya sale yang bisa menerbitkan kunci.
    function bindSale(address sale_) external {
        require(msg.sender == deployer, "ScherzoKey: not the deployer");
        require(sale == address(0), "ScherzoKey: sale already bound");
        require(sale_ != address(0), "ScherzoKey: sale zero address");
        sale = sale_;
        emit SaleBound(sale_);
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------
    /// @notice True bila alamat ini sudah memegang kunci SCHERZO.
    function hasKey(address user) external view returns (bool) {
        return keyOf[user] != 0;
    }

    function balanceOf(address owner) external view returns (uint256) {
        require(owner != address(0), "ScherzoKey: zero address");
        return keyOf[owner] != 0 ? 1 : 0;
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        address owner = _ownerOf[tokenId];
        require(owner != address(0), "ScherzoKey: nonexistent token");
        return owner;
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        require(_ownerOf[tokenId] != address(0), "ScherzoKey: nonexistent token");
        return KEY_METADATA_URI;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return
            interfaceId == 0x01ffc9a7 || // ERC-165
            interfaceId == 0x80ac58cd || // ERC-721
            interfaceId == 0x5b5e139f; // ERC-721 metadata
    }

    // ------------------------------------------------------------------
    // Mint — hanya SymphonySale ter-bind, tepat satu per wallet
    // ------------------------------------------------------------------
    /// @notice Terbitkan kunci SCHERZO untuk `to`. Hanya SymphonySale.
    ///         Revert bila wallet itu sudah punya kunci — SymphonySale
    ///         menjaga pemanggilan ini dengan hasKey() sehingga Encore
    ///         berikutnya dari wallet yang sama tidak pernah mencapai
    ///         revert ini dan klaimnya tidak pernah gagal karenanya.
    function mintKey(address to) external returns (uint256 tokenId) {
        require(msg.sender == sale, "ScherzoKey: only the sale");
        require(to != address(0), "ScherzoKey: mint to zero address");
        require(keyOf[to] == 0, "ScherzoKey: key already minted");
        tokenId = _nextTokenId++;
        _ownerOf[tokenId] = to;
        keyOf[to] = tokenId;
        totalKeys += 1;
        emit Transfer(address(0), to, tokenId);
        emit KeyMinted(to, tokenId);
    }

    // ------------------------------------------------------------------
    // Soulbound — semua jalur pemindahan & persetujuan revert permanen
    // ------------------------------------------------------------------
    function approve(address, uint256) external pure {
        revert("ScherzoKey: soulbound key");
    }

    function setApprovalForAll(address, bool) external pure {
        revert("ScherzoKey: soulbound key");
    }

    function getApproved(uint256 tokenId) external view returns (address) {
        require(_ownerOf[tokenId] != address(0), "ScherzoKey: nonexistent token");
        return address(0);
    }

    function isApprovedForAll(address, address) external pure returns (bool) {
        return false;
    }

    function transferFrom(address, address, uint256) external pure {
        revert("ScherzoKey: soulbound key");
    }

    function safeTransferFrom(address, address, uint256) external pure {
        revert("ScherzoKey: soulbound key");
    }

    function safeTransferFrom(address, address, uint256, bytes calldata) external pure {
        revert("ScherzoKey: soulbound key");
    }
}
