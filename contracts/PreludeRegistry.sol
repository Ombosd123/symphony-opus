// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Interface minimal registry Agent ID resmi (SPACE ID Agent ID,
///         ERC-721 non-transferable). Gate = balanceOf(alamat) > 0.
///         Pola yang sama dengan kontrak-kontrak sebelumnya.
interface IAgentIdRegistry {
    function balanceOf(address owner) external view returns (uint256);
}

/// @title PreludeRegistry — registrasi Prelude SYMPHONY + Prelude Pass
/// @notice SPEC-SYMPHONY.md bagian 3 & 10 (fase 1):
///         - register() GRATIS (nonpayable, gas saja), khusus pemegang
///           Binance Agent ID, 1 pendaftaran per alamat SELAMANYA (alamat
///           yang sudah pernah mendaftar tidak bisa mendaftar lagi,
///           termasuk setelah membakar Pass-nya — hitungan gerbang 500
///           adalah hitungan historis dan tidak boleh digandakan).
///         - Pendaftar menerima Prelude Pass: ERC-721 SOULBOUND (semua
///           jalur transfer/persetujuan revert permanen).
///         - Pendaftaran ditutup pada registrationEnd yang ditetapkan di
///           konstruktor. Nilai produksi: 12 Des 2026 12:00:00 UTC
///           (unix 1797076800 — momen sale dibuka, SPEC bagian 5).
///           register() revert pada / setelah waktu itu.
///         - registerRef(referrer): jalur registrasi yang sama, plus
///           mencatat pemberi referensi fase 1 (keputusan
///           2026-11-22 — versi PENUH). Referrer wajib sudah
///           memegang Prelude Pass (passOf != 0), tidak boleh diri
///           sendiri, dan catatan referrerOf bersifat permanen
///           (ditulis sekali saat registrasi, tidak bisa diubah).
///           referralCount[referrer] = hitungan MENTAH (tanpa cap);
///           cap 50 orang & tarif 100 OPUS/orang diterapkan distributor
///           Merkle fase 2 saat membangun pohon klaim dari catatan ini.
///         - count()/totalRegistered = jumlah pendaftar historis. Burn
///           oleh holder TIDAK mengurangi hitungan ini (gerbang 500
///           membaca akumulasi pendaftaran, bukan Pass yang masih hidup).
///         - burn(tokenId): hanya holder token itu, satu per satu;
///           dipakai fase 2 untuk klaim bonus konversi (burn-to-claim,
///           SPEC bagian 9). Klaim TIDAK mensyaratkan Agent ID aktif —
///           kontrak ini tidak memeriksa registry pada burn.
///         Kontrak IMMUTABLE: tanpa owner, tanpa pause, tanpa withdraw,
///         tanpa fungsi istimewa apa pun setelah deploy.
contract PreludeRegistry {
    // ------------------------------------------------------------------
    // Parameter (immutable, ditetapkan di konstruktor)
    // ------------------------------------------------------------------
    /// @notice Akhir pendaftaran Prelude (unix). Produksi: 1797076800
    ///         (12 Des 2026 12:00:00 UTC). Batas EKSKLUSIF: register()
    ///         sah sampai satu detik sebelumnya.
    uint256 public immutable registrationEnd;
    /// @notice Registry Agent ID resmi: 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F
    IAgentIdRegistry public immutable registry;

    /// @notice Gerbang minimum pendaftar agar sale sah dibuka (SPEC 3).
    ///         Konstanta dokumentasi — penegakannya ada di kontrak sale
    ///         fase 2 yang membaca count() kontrak ini.
    uint256 public constant MIN_REGISTRANTS = 500;
    /// @notice URI metadata Prelude Pass (metadata di domain situs proyek,
    ///         pola yang sama). ASUMSI DEPLOY: kandidat domain
    ///         symphony-opus.pages.dev — bila domain final berbeda, ubah
    ///         SATU konstanta ini lalu kompilasi ulang sebelum deploy.
    string public constant PASS_METADATA_URI = "https://symphony-opus.pages.dev/prelude.json";

    // ------------------------------------------------------------------
    // ERC-721 minimal — Prelude Pass SOULBOUND
    // ------------------------------------------------------------------
    string public constant name = "SYMPHONY Prelude Pass";
    string public constant symbol = "PRELUDE";
    uint256 private _nextTokenId = 1;
    mapping(uint256 => address) private _ownerOf;
    /// @notice passOf[alamat] = tokenId Prelude Pass yang masih hidup
    ///         (0 = tidak memegang Pass saat ini).
    mapping(address => uint256) public passOf;

    // ------------------------------------------------------------------
    // State registrasi
    // ------------------------------------------------------------------
    /// @notice Jumlah pendaftar historis (tidak pernah berkurang,
    ///         termasuk oleh burn). Sumber gerbang 500.
    uint256 public totalRegistered;
    /// @notice Pernah mendaftar — permanen, tidak direset oleh burn.
    mapping(address => bool) private _hasRegistered;
    /// @notice Referrer fase 1 yang tercatat untuk pendaftar ini
    ///         (address(0) = mendaftar tanpa referrer). Ditulis sekali
    ///         saat registrasi via registerRef, tidak pernah berubah.
    mapping(address => address) public referrerOf;
    /// @notice Hitungan MENTAH pendaftaran yang dibawa oleh referrer
    ///         ini (tanpa cap — cap 50 diterapkan distributor fase 2).
    mapping(address => uint256) public referralCount;

    // ------------------------------------------------------------------
    // Events (Transfer = event ERC-721 standar)
    // ------------------------------------------------------------------
    event Registered(address indexed user, uint256 tokenId, uint256 count, address referrer);
    event PassBurned(address indexed user, uint256 tokenId);
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    constructor(address registry_, uint256 registrationEnd_) {
        require(registry_ != address(0), "PreludeRegistry: registry zero address");
        require(registrationEnd_ > block.timestamp, "PreludeRegistry: end in the past");
        registry = IAgentIdRegistry(registry_);
        registrationEnd = registrationEnd_;
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------
    /// @notice Jumlah pendaftar historis (= totalRegistered).
    function count() external view returns (uint256) {
        return totalRegistered;
    }

    /// @notice True bila alamat ini PERNAH mendaftar (tetap true setelah
    ///         burn — inilah yang dipakai gerbang jendela awal fase 2).
    function isRegistered(address user) external view returns (bool) {
        return _hasRegistered[user];
    }

    /// @notice True bila alamat ini sedang memegang Prelude Pass hidup.
    function hasPass(address user) external view returns (bool) {
        return passOf[user] != 0;
    }

    /// @notice Alias hasPass().
    function holdsPass(address user) external view returns (bool) {
        return passOf[user] != 0;
    }

    function balanceOf(address owner) external view returns (uint256) {
        require(owner != address(0), "PreludeRegistry: zero address");
        return passOf[owner] != 0 ? 1 : 0;
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        address owner = _ownerOf[tokenId];
        require(owner != address(0), "PreludeRegistry: nonexistent token");
        return owner;
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        require(_ownerOf[tokenId] != address(0), "PreludeRegistry: nonexistent token");
        return PASS_METADATA_URI;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return
            interfaceId == 0x01ffc9a7 || // ERC-165
            interfaceId == 0x80ac58cd || // ERC-721
            interfaceId == 0x5b5e139f; // ERC-721 metadata
    }

    // ------------------------------------------------------------------
    // Registrasi
    // ------------------------------------------------------------------
    /// @notice Daftar Prelude: gratis, 1x per alamat selamanya, khusus
    ///         pemegang Agent ID, sebelum registrationEnd. Menerbitkan
    ///         Prelude Pass soulbound ke pendaftar.
    function register() external {
        _register(address(0));
    }

    /// @notice Daftar Prelude lewat referrer fase 1: registrasi yang
    ///         sama persis dengan register(), plus mencatat referrer
    ///         secara permanen. Referrer wajib sudah memegang Prelude
    ///         Pass (pendaftar yang Pass-nya sudah dibakar tidak bisa
    ///         menjadi referrer) dan tidak boleh alamat sendiri.
    function registerRef(address referrer) external {
        require(referrer != address(0), "PreludeRegistry: referrer zero address");
        require(referrer != msg.sender, "PreludeRegistry: self-referral");
        require(passOf[referrer] != 0, "PreludeRegistry: referrer not registered");
        _register(referrer);
    }

    function _register(address referrer) internal {
        require(block.timestamp < registrationEnd, "PreludeRegistry: registration closed");
        require(registry.balanceOf(msg.sender) > 0, "PreludeRegistry: not an Agent ID holder");
        require(!_hasRegistered[msg.sender], "PreludeRegistry: already registered");

        _hasRegistered[msg.sender] = true;
        totalRegistered += 1;

        if (referrer != address(0)) {
            referrerOf[msg.sender] = referrer;
            referralCount[referrer] += 1;
        }

        uint256 tokenId = _nextTokenId++;
        _ownerOf[tokenId] = msg.sender;
        passOf[msg.sender] = tokenId;

        emit Transfer(address(0), msg.sender, tokenId);
        emit Registered(msg.sender, tokenId, totalRegistered, referrer);
    }

    // ------------------------------------------------------------------
    // Burn oleh holder (klaim bonus fase 2)
    // ------------------------------------------------------------------
    /// @notice Bakar Prelude Pass milik sendiri, satu per satu. Hanya
    ///         holder token itu. Hitungan pendaftar (count /
    ///         totalRegistered) dan status isRegistered TIDAK berubah —
    ///         keduanya historis.
    function burn(uint256 tokenId) external {
        require(_ownerOf[tokenId] == msg.sender, "PreludeRegistry: not the holder");
        delete _ownerOf[tokenId];
        passOf[msg.sender] = 0;
        emit Transfer(msg.sender, address(0), tokenId);
        emit PassBurned(msg.sender, tokenId);
    }

    // ------------------------------------------------------------------
    // Soulbound — semua jalur pemindahan & persetujuan revert
    // ------------------------------------------------------------------
    function approve(address, uint256) external pure {
        revert("PreludeRegistry: soulbound pass");
    }

    function setApprovalForAll(address, bool) external pure {
        revert("PreludeRegistry: soulbound pass");
    }

    function getApproved(uint256 tokenId) external view returns (address) {
        require(_ownerOf[tokenId] != address(0), "PreludeRegistry: nonexistent token");
        return address(0);
    }

    function isApprovedForAll(address, address) external pure returns (bool) {
        return false;
    }

    function transferFrom(address, address, uint256) external pure {
        revert("PreludeRegistry: soulbound pass");
    }

    function safeTransferFrom(address, address, uint256) external pure {
        revert("PreludeRegistry: soulbound pass");
    }

    function safeTransferFrom(address, address, uint256, bytes calldata) external pure {
        revert("PreludeRegistry: soulbound pass");
    }
}
