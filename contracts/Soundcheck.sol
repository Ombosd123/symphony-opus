// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Interface minimal registry Agent ID resmi. Gate = balanceOf > 0.
interface IAgentIdRegistrySC {
    function balanceOf(address owner) external view returns (uint256);
}

/// @notice Interface ERC-20 minimal (USDT BSC, 18 desimal).
interface IERC20SC {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title Soundcheck — check-in harian SYMPHONY + badge streak + Opus Magnum
/// @notice SPEC-SYMPHONY.md bagian 4, 7, 9 & 10 (fase 1):
///         - checkIn() GRATIS (nonpayable), gate Agent ID, 1x per hari UTC
///           per alamat, terbuka untuk SEMUA pemegang Agent ID.
///         - Streak berurutan (hari UTC). Badge soulbound terbit otomatis:
///           streak 1 = FIRST NOTE (tipe 1), 3 = TUNING (tipe 2),
///           7 = REHEARSAL (tipe 3), 14 = FULL SCORE (tipe 4) + OPUS
///           MAGNUM (tipe 5, instrumen klaim Soundcheck — diterbitkan
///           SEKALI per alamat selamanya).
///         - Badge tipe 1–4 SOULBOUND SELAMANYA: semua transfer revert,
///           tidak bisa dibakar siapa pun.
///         - Magnum: transfer revert sampai deployer mem-bind market resmi
///           SATU KALI (bindMarket); setelah itu transfer hanya bisa
///           dilakukan OLEH kontrak market (pola escrow). Holder Magnum
///           bisa burn(tokenId) miliknya, satu per satu (burn-to-claim
///           fase 2, SPEC bagian 9 — klaim tidak mensyaratkan Agent ID,
///           kontrak ini tidak memeriksa registry pada burn).
///         - Streak putus tepat 1 hari (kemarin bolong): pengguna memilih
///           reset gratis (checkIn biasa memulai streak baru dari 1) ATAU
///           repairStreak() membayar TEPAT 0,1 USDT: 0,05 USDT diteruskan
///           ke TreasuryVault (bagian tim — tidak kembali walau sale
///           gagal), 0,05 USDT ditahan kontrak sebagai bagian pool dan
///           dicatat per pengguna di poolSharePaid. Bolong >1 hari:
///           repairStreak revert — hanya bisa reset.
///         - Nasib bagian pool (SPEC 4, revisi 2026-11-22 ~04:10): sale
///           fase 2 di-bind satu kali oleh deployer (bindSale), lalu
///           kontrak sale memanggil markGraduated(pool) → seluruh
///           akumulasi disapu ke alamat pool & musim berakhir; atau
///           markFailed(refundDeadline) → tiap pengguna mengambil kembali
///           akumulasinya lewat claimPoolShareRefund() selama jendela
///           refund; lewat jendela, sisa terkunci di kontrak selamanya.
///         - Batas keras musim: seasonEnd di konstruktor. Produksi:
///           30 Des 2026 12:00:00 UTC (unix 1798632000 — momen vonis sale). checkIn &
///           repairStreak revert pada / setelah waktu itu, dan juga
///           setelah markGraduated (musim berakhir saat graduation).
///         Kontrak IMMUTABLE: tanpa owner-withdraw / pause / upgrade.
///         Satu-satunya hak istimewa: deployer memanggil bindMarket dan
///         bindSale, masing-masing SATU kali, hanya menetapkan alamat.
contract Soundcheck {
    // ------------------------------------------------------------------
    // Konstanta
    // ------------------------------------------------------------------
    uint8 public constant BADGE_FIRST_NOTE = 1;
    uint8 public constant BADGE_TUNING = 2;
    uint8 public constant BADGE_REHEARSAL = 3;
    uint8 public constant BADGE_FULL_SCORE = 4;
    uint8 public constant BADGE_MAGNUM = 5;

    /// @notice Biaya perbaikan streak: tepat 0,1 USDT (18 desimal).
    uint256 public constant REPAIR_FEE = 0.1 ether;
    /// @notice Bagian tim dari biaya perbaikan: 0,05 USDT ke TreasuryVault.
    uint256 public constant REPAIR_TEAM_SHARE = 0.05 ether;
    /// @notice Bagian pool dari biaya perbaikan: 0,05 USDT ditahan kontrak.
    uint256 public constant REPAIR_POOL_SHARE = 0.05 ether;

    string public constant name = "SYMPHONY Soundcheck";
    string public constant symbol = "SOUNDCHECK";

    // ------------------------------------------------------------------
    // Parameter immutable
    // ------------------------------------------------------------------
    IAgentIdRegistrySC public immutable registry;
    IERC20SC public immutable usdt;
    address public immutable treasuryVault;
    /// @notice Batas keras akhir musim (unix). Produksi: 1798632000.
    uint256 public immutable seasonEnd;
    /// @notice Alamat deployer — hanya untuk bind satu-kali (lihat header).
    address public immutable deployer;

    // ------------------------------------------------------------------
    // State NFT
    // ------------------------------------------------------------------
    uint256 private _nextTokenId = 1;
    mapping(uint256 => address) private _ownerOf;
    mapping(uint256 => uint8) public badgeTypeOf;
    /// @notice badgeOf[alamat][tipe] = tokenId (0 = belum punya).
    mapping(address => mapping(uint8 => uint256)) public badgeOf;
    /// @notice Magnum pernah diterbitkan untuk alamat ini (sekali selamanya,
    ///         tetap true walau Magnum dibakar / berpindah).
    mapping(address => bool) public magnumMinted;
    mapping(uint256 => address) private _magnumApproval;

    // ------------------------------------------------------------------
    // State streak
    // ------------------------------------------------------------------
    mapping(address => uint256) public streakOf;
    /// @notice Indeks hari UTC (timestamp / 86400) check-in terakhir.
    mapping(address => uint256) public lastCheckInDayOf;
    mapping(address => uint256) public totalCheckInsOf;

    // ------------------------------------------------------------------
    // State bagian pool perbaikan streak
    // ------------------------------------------------------------------
    /// @notice Akumulasi bagian pool (0,05 USDT per perbaikan) per pengguna.
    mapping(address => uint256) public poolSharePaid;
    /// @notice Total bagian pool yang masih ditahan kontrak.
    uint256 public totalPoolShare;

    enum Outcome {
        Undecided,
        Graduated,
        Failed
    }
    Outcome public outcome;
    uint256 public refundDeadline;

    // ------------------------------------------------------------------
    // Binding satu-kali
    // ------------------------------------------------------------------
    address public market;
    address public sale;

    /// @notice Musim berakhir lebih awal karena graduation.
    bool public seasonEndedByGraduation;

    // ------------------------------------------------------------------
    // Events
    // ------------------------------------------------------------------
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event CheckedIn(address indexed user, uint256 streak, uint256 day);
    event BadgeMinted(address indexed user, uint8 indexed badgeType, uint256 tokenId);
    event StreakRepaired(address indexed user, uint256 streak);
    event MagnumBurned(address indexed user, uint256 tokenId);
    event MarketBound(address indexed market);
    event SaleBound(address indexed sale);
    event Graduated(address indexed poolRecipient, uint256 poolShareSwept);
    event Failed(uint256 refundDeadline);
    event PoolShareRefunded(address indexed user, uint256 amount);

    constructor(address registry_, address usdt_, address treasuryVault_, uint256 seasonEnd_) {
        require(registry_ != address(0), "Soundcheck: registry zero address");
        require(usdt_ != address(0), "Soundcheck: usdt zero address");
        require(treasuryVault_ != address(0), "Soundcheck: vault zero address");
        require(seasonEnd_ > block.timestamp, "Soundcheck: season end in the past");
        registry = IAgentIdRegistrySC(registry_);
        usdt = IERC20SC(usdt_);
        treasuryVault = treasuryVault_;
        seasonEnd = seasonEnd_;
        deployer = msg.sender;
    }

    // ------------------------------------------------------------------
    // Views ERC-721-ish
    // ------------------------------------------------------------------
    function balanceOf(address owner) external view returns (uint256 n) {
        require(owner != address(0), "Soundcheck: zero address");
        for (uint8 t = 1; t <= 5; t++) {
            if (badgeOf[owner][t] != 0) n += 1;
        }
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        address owner = _ownerOf[tokenId];
        require(owner != address(0), "Soundcheck: nonexistent token");
        return owner;
    }

    /// @notice True bila alamat ini SEDANG memegang Opus Magnum.
    function hasMagnum(address user) external view returns (bool) {
        return badgeOf[user][BADGE_MAGNUM] != 0;
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        require(_ownerOf[tokenId] != address(0), "Soundcheck: nonexistent token");
        uint8 t = badgeTypeOf[tokenId];
        if (t == BADGE_FIRST_NOTE) return "https://symphony-opus.pages.dev/badge-first-note.json";
        if (t == BADGE_TUNING) return "https://symphony-opus.pages.dev/badge-tuning.json";
        if (t == BADGE_REHEARSAL) return "https://symphony-opus.pages.dev/badge-rehearsal.json";
        if (t == BADGE_FULL_SCORE) return "https://symphony-opus.pages.dev/badge-full-score.json";
        return "https://symphony-opus.pages.dev/opus-magnum.json";
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return
            interfaceId == 0x01ffc9a7 || // ERC-165
            interfaceId == 0x80ac58cd || // ERC-721
            interfaceId == 0x5b5e139f; // ERC-721 metadata
    }

    // ------------------------------------------------------------------
    // Check-in & streak
    // ------------------------------------------------------------------
    function _today() internal view returns (uint256) {
        return block.timestamp / 86400;
    }

    function _seasonOpen() internal view {
        require(!seasonEndedByGraduation, "Soundcheck: season ended at graduation");
        require(block.timestamp < seasonEnd, "Soundcheck: season over");
    }

    /// @notice Check-in harian gratis. Melanjutkan streak bila kemarin
    ///         check-in; memulai streak baru (reset) bila bolong >= 1 hari
    ///         dan pengguna memilih jalur gratis; hari yang sama revert.
    function checkIn() external {
        _seasonOpen();
        require(registry.balanceOf(msg.sender) > 0, "Soundcheck: not an Agent ID holder");
        uint256 day = _today();
        uint256 last = lastCheckInDayOf[msg.sender];
        require(last != day, "Soundcheck: already checked in today");

        uint256 streak;
        if (last != 0 && last == day - 1) {
            streak = streakOf[msg.sender] + 1;
        } else {
            // Check-in pertama, atau bolong >= 1 hari tanpa perbaikan:
            // streak (re)dimulai dari 1.
            streak = 1;
        }
        streakOf[msg.sender] = streak;
        lastCheckInDayOf[msg.sender] = day;
        totalCheckInsOf[msg.sender] += 1;
        emit CheckedIn(msg.sender, streak, day);
        _mintBadgesUpTo(msg.sender, streak);
    }

    /// @notice Perbaiki streak yang bolong TEPAT 1 hari (kemarin) dengan
    ///         membayar tepat 0,1 USDT. Hari yang bolong dihitung sebagai
    ///         check-in (streak +1, lastCheckInDay = kemarin), sehingga
    ///         checkIn() hari ini melanjutkan streak. Split: 0,05 USDT
    ///         ke TreasuryVault, 0,05 USDT ditahan sebagai bagian pool.
    function repairStreak() external {
        _seasonOpen();
        require(registry.balanceOf(msg.sender) > 0, "Soundcheck: not an Agent ID holder");
        uint256 day = _today();
        uint256 last = lastCheckInDayOf[msg.sender];
        require(last != 0 && streakOf[msg.sender] > 0, "Soundcheck: no streak to repair");
        require(last == day - 2, "Soundcheck: repair bridges exactly one missed day");

        // Tarik tepat 0,1 USDT dari pengguna.
        require(
            usdt.transferFrom(msg.sender, address(this), REPAIR_FEE),
            "Soundcheck: repair payment failed"
        );
        // Bagian tim langsung ke TreasuryVault (tidak kembali walau gagal).
        require(usdt.transfer(treasuryVault, REPAIR_TEAM_SHARE), "Soundcheck: vault transfer failed");
        // Bagian pool ditahan kontrak & dicatat per pengguna.
        poolSharePaid[msg.sender] += REPAIR_POOL_SHARE;
        totalPoolShare += REPAIR_POOL_SHARE;

        uint256 streak = streakOf[msg.sender] + 1;
        streakOf[msg.sender] = streak;
        lastCheckInDayOf[msg.sender] = day - 1;
        totalCheckInsOf[msg.sender] += 1;
        emit StreakRepaired(msg.sender, streak);
        _mintBadgesUpTo(msg.sender, streak);
    }

    /// @notice Terbitkan badge yang ambangnya tercapai oleh `streak`
    ///         (masing-masing sekali per alamat; Magnum sekali selamanya).
    function _mintBadgesUpTo(address user, uint256 streak) internal {
        if (streak >= 1) _mintBadge(user, BADGE_FIRST_NOTE);
        if (streak >= 3) _mintBadge(user, BADGE_TUNING);
        if (streak >= 7) _mintBadge(user, BADGE_REHEARSAL);
        if (streak >= 14) {
            _mintBadge(user, BADGE_FULL_SCORE);
            if (!magnumMinted[user]) {
                magnumMinted[user] = true;
                _mintBadge(user, BADGE_MAGNUM);
            }
        }
    }

    function _mintBadge(address user, uint8 badgeType) internal {
        if (badgeOf[user][badgeType] != 0) return;
        uint256 tokenId = _nextTokenId++;
        _ownerOf[tokenId] = user;
        badgeTypeOf[tokenId] = badgeType;
        badgeOf[user][badgeType] = tokenId;
        emit Transfer(address(0), user, tokenId);
        emit BadgeMinted(user, badgeType, tokenId);
    }

    // ------------------------------------------------------------------
    // Burn — HANYA Opus Magnum, oleh holdernya, satu per satu
    // ------------------------------------------------------------------
    /// @notice Bakar Opus Magnum milik sendiri (burn-to-claim fase 2).
    ///         Badge milestone (tipe 1–4) tidak bisa dibakar siapa pun.
    function burn(uint256 tokenId) external {
        require(_ownerOf[tokenId] == msg.sender, "Soundcheck: not the holder");
        require(badgeTypeOf[tokenId] == BADGE_MAGNUM, "Soundcheck: milestone badges cannot be burned");
        delete _ownerOf[tokenId];
        badgeOf[msg.sender][BADGE_MAGNUM] = 0;
        delete _magnumApproval[tokenId];
        emit Transfer(msg.sender, address(0), tokenId);
        emit MagnumBurned(msg.sender, tokenId);
    }

    // ------------------------------------------------------------------
    // Binding satu-kali oleh deployer
    // ------------------------------------------------------------------
    /// @notice Bind kontrak market resmi (fase 2) — satu kali, hanya
    ///         deployer. Setelah ter-bind, Magnum hanya bisa berpindah
    ///         lewat kontrak market ini.
    function bindMarket(address market_) external {
        require(msg.sender == deployer, "Soundcheck: not the deployer");
        require(market == address(0), "Soundcheck: market already bound");
        require(market_ != address(0), "Soundcheck: market zero address");
        market = market_;
        emit MarketBound(market_);
    }

    /// @notice Bind kontrak sale (fase 2) — satu kali, hanya deployer.
    ///         Kontrak sale yang ter-bind yang berhak menandai hasil
    ///         akhir (graduated / failed) untuk bagian pool perbaikan.
    function bindSale(address sale_) external {
        require(msg.sender == deployer, "Soundcheck: not the deployer");
        require(sale == address(0), "Soundcheck: sale already bound");
        require(sale_ != address(0), "Soundcheck: sale zero address");
        sale = sale_;
        emit SaleBound(sale_);
    }

    // ------------------------------------------------------------------
    // Nasib bagian pool perbaikan (dipanggil kontrak sale fase 2)
    // ------------------------------------------------------------------
    /// @notice Sale LULUS: sapu seluruh akumulasi bagian pool ke alamat
    ///         penanaman pool, dan akhiri musim Soundcheck.
    function markGraduated(address poolRecipient) external {
        require(msg.sender == sale, "Soundcheck: not the sale");
        require(outcome == Outcome.Undecided, "Soundcheck: outcome already set");
        require(poolRecipient != address(0), "Soundcheck: pool zero address");
        outcome = Outcome.Graduated;
        seasonEndedByGraduation = true;
        uint256 amount = totalPoolShare;
        totalPoolShare = 0;
        if (amount > 0) {
            require(usdt.transfer(poolRecipient, amount), "Soundcheck: sweep failed");
        }
        emit Graduated(poolRecipient, amount);
    }

    /// @notice Sale GAGAL: buka jendela klaim-kembali bagian pool sampai
    ///         `refundDeadline_` (produksi: akhir jendela refund sale).
    function markFailed(uint256 refundDeadline_) external {
        require(msg.sender == sale, "Soundcheck: not the sale");
        require(outcome == Outcome.Undecided, "Soundcheck: outcome already set");
        outcome = Outcome.Failed;
        refundDeadline = refundDeadline_;
        emit Failed(refundDeadline_);
    }

    /// @notice Ambil kembali akumulasi bagian pool milik sendiri bila
    ///         sale gagal, selama jendela refund. Lewat jendela: sisa
    ///         terkunci di kontrak selamanya (tidak ada fungsi penarik).
    function claimPoolShareRefund() external {
        require(outcome == Outcome.Failed, "Soundcheck: sale did not fail");
        require(block.timestamp <= refundDeadline, "Soundcheck: refund window closed");
        uint256 amount = poolSharePaid[msg.sender];
        require(amount > 0, "Soundcheck: nothing to refund");
        poolSharePaid[msg.sender] = 0;
        totalPoolShare -= amount;
        require(usdt.transfer(msg.sender, amount), "Soundcheck: refund transfer failed");
        emit PoolShareRefunded(msg.sender, amount);
    }

    // ------------------------------------------------------------------
    // Transfer & approval — badge soulbound; Magnum hanya via market
    // ------------------------------------------------------------------
    function approve(address spender, uint256 tokenId) external {
        require(_ownerOf[tokenId] == msg.sender, "Soundcheck: not the holder");
        require(badgeTypeOf[tokenId] == BADGE_MAGNUM, "Soundcheck: soulbound badge");
        require(market != address(0) && spender == market, "Soundcheck: only the official market");
        _magnumApproval[tokenId] = spender;
    }

    function setApprovalForAll(address, bool) external pure {
        revert("Soundcheck: approvals disabled");
    }

    function getApproved(uint256 tokenId) external view returns (address) {
        require(_ownerOf[tokenId] != address(0), "Soundcheck: nonexistent token");
        return _magnumApproval[tokenId];
    }

    function isApprovedForAll(address, address) external pure returns (bool) {
        return false;
    }

    function transferFrom(address from, address to, uint256 tokenId) external {
        _transferMagnum(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        _transferMagnum(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata) external {
        _transferMagnum(from, to, tokenId);
    }

    /// @notice Satu-satunya jalur perpindahan: Opus Magnum, dipanggil
    ///         OLEH kontrak market yang ter-bind, dari holder saat ini.
    function _transferMagnum(address from, address to, uint256 tokenId) internal {
        require(badgeTypeOf[tokenId] == BADGE_MAGNUM, "Soundcheck: soulbound badge");
        require(market != address(0), "Soundcheck: market not bound yet");
        require(msg.sender == market, "Soundcheck: only the official market");
        require(_ownerOf[tokenId] == from, "Soundcheck: not the holder");
        require(to != address(0), "Soundcheck: zero address");
        _ownerOf[tokenId] = to;
        badgeOf[from][BADGE_MAGNUM] = 0;
        badgeOf[to][BADGE_MAGNUM] = tokenId;
        delete _magnumApproval[tokenId];
        emit Transfer(from, to, tokenId);
    }
}
