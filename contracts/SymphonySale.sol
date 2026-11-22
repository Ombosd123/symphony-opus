// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Interface ERC-20 minimal (USDT, 18 desimal).
interface IERC20Sale {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}

/// @notice Interface OPUS (ERC-20 + burn saldo sendiri).
interface IOpusSale is IERC20Sale {
    function burn(uint256 amount) external;
}

/// @notice Interface registry Agent ID resmi. Gate = balanceOf > 0.
interface IAgentIdRegistrySale {
    function balanceOf(address owner) external view returns (uint256);
}

/// @notice Interface PreludeRegistry (gerbang 500 + jendela 48 jam).
interface IPreludeForSale {
    function count() external view returns (uint256);
    function isRegistered(address user) external view returns (bool);
}

/// @notice Interface Soundcheck (penanda hasil akhir fase 1).
interface ISoundcheckForSale {
    function markGraduated(address poolRecipient) external;
    function markFailed(uint256 refundDeadline) external;
}

/// @notice Interface SymphonyPass (mint oleh sale, burn oleh sale).
interface IPassForSale {
    function mint(address to, uint8 tier, uint256 paid) external returns (uint256);
    function burn(uint256 tokenId) external;
    function ownerOf(uint256 tokenId) external view returns (address);
    function tierOf(uint256 tokenId) external view returns (uint8);
    function paidOf(uint256 tokenId) external view returns (uint256);
    function balanceOf(address owner) external view returns (uint256);
}

/// @notice Interface OpusPresale (sapuan hasil saat finalize).
interface IPresaleForSale {
    function sweepProceeds() external returns (uint256);
}

/// @notice Interface ScherzoKey (kunci SCHERZO soulbound — registry
///         kanonis kursi Overture Season 2; amendemen SPEC 9).
interface IScherzoKeyForSale {
    function hasKey(address user) external view returns (bool);
    function mintKey(address to) external returns (uint256);
}

/// @notice PancakeSwap V2 (produksi BSC: factory
///         0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73, router
///         0x10ED43C718714eb63d5aA57B78B54704E256024E).
interface IPancakeFactory {
    function getPair(address tokenA, address tokenB) external view returns (address);
    function createPair(address tokenA, address tokenB) external returns (address);
}

interface IPancakeRouter {
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity);
}

interface IPancakePair {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @title SymphonySale — sale Mint Pass SYMPHONY + vonis + klaim
/// @notice SPEC-SYMPHONY.md bagian 2, 5, 6, 9 & 10 (fase 2):
///         - Escrow USDT. 5.000 Pass, maks 10 pembelian primer/wallet.
///           Tier dari URUTAN penjualan (totalSold): 1–1.500 Overture
///           1 USDT → 78.000 OPUS; 1.501–3.500 Crescendo 1,5 USDT →
///           65.000; 3.501–5.000 Finale 2 USDT → 52.000. Raise penuh
///           7.500 USDT; alokasi peserta 325 jt dipegang kontrak ini
///           (bersama pool 175 jt + referral 25 jt + Encore 5 jt yang
///           dicetak OpusToken ke sini).
///         - Buka: timestamp ≥ SALE_START (produksi 1797076800 =
///           12 Des 2026 12:00 UTC) DAN PreludeRegistry.count() ≥ 500.
///           CATATAN SPEC (ditandai, bukan ditebak): bagian 3 berkata
///           sale "mundur sampai 500 tercapai", tetapi pendaftaran
///           Prelude TUTUP tepat pada jam buka (bagian 5 + konstruktor
///           PreludeRegistry) — jadi bila count < 500 pada 12 Des,
///           count beku dan gerbang tidak akan pernah terpenuhi.
///           Kontrak ini menegakkan gabungan literalnya: pembelian
///           pertama yang sah menandai openedAt pada momen kedua
///           syarat pertama kali sama-sama terpenuhi (openSale() bisa
///           dipanggil siapa pun untuk menandainya tepat waktu), dan
///           jendela 48 jam khusus Prelude berjalan dari openedAt.
///           Vonis tetap 30 Des berapa pun openedAt-nya.
///         - 48 jam pertama sejak openedAt: hanya pendaftar Prelude.
///           Setelahnya: semua pemegang Agent ID. Gate Agent ID berlaku
///           untuk SEMUA pembelian primer (pintu masuk, SPEC 9).
///         - Referral: pembeli boleh menamai referrer yang SUDAH
///           memegang ≥1 Pass (diperiksa sebelum mint transaksi ini);
///           referrer mengakru 5.000 OPUS per Pass dari alokasi 25 jt,
///           diklaim lewat claimReferral() setelah graduation, tanpa
///           tenggat. Self-referral dilarang (preseden registerRef
///           fase 1). Sisa alokasi yang tidak terakru DIBAKAR di
///           finalize jalur lulus.
///         - VONIS TANGGAL TETAP pada VERDICT (produksi 1798632000 =
///           30 Des 2026 12:00 UTC): finalize() permissionless —
///           totalSold == 5.000 → LULUS: sapu hasil presale (90% pool /
///           10% vault, oleh OpusPresale.sweepProceeds) + sapu bagian
///           pool perbaikan Soundcheck ke kontrak ini, 750 USDT (10%)
///           ke TreasuryVault, tanam pool PancakeSwap V2 (175 jt OPUS
///           + 6.750 USDT + 90% presale + sapuan Soundcheck), LP
///           DIBAKAR ke alamat mati, bakar sisa referral, panggil
///           Soundcheck.markGraduated. totalSold < 5.000 → GAGAL:
///           Soundcheck.markFailed; refund burn-to-settle sebesar
///           paidOf selama [VERDICT, VERDICT + 14 hari]; lewat itu
///           USDT tak terklaim terkunci selamanya (tidak ada fungsi
///           penarik). Habis lebih awal TIDAK membuka apa pun sebelum
///           vonis — klaim & finalize revert sebelum VERDICT.
///         - Burn-to-claim (hanya setelah lulus; TANPA syarat Agent ID,
///           SPEC 9), selalu SATU tokenId per transaksi — tidak ada
///           fungsi massal:
///           PREMIERE: 100% langsung, tanpa tenggat.
///           ENCORE (hanya ≤ 30 hari sejak vonis): 50% langsung + 50%
///           vesting linear 60 hari per posisi (withdrawEncore tanpa
///           tenggat) + bonus kolam Encore 5 jt (claimEncoreBonus
///           setelah jendela pilih berakhir) + kursi Overture Scherzo
///           tercatat on-chain di scherzoOvertureSeats. Pada Encore
///           PERTAMA sebuah wallet, kontrak ini juga menerbitkan
///           kunci SCHERZO soulbound untuk wallet itu lewat kontrak
///           ScherzoKey (tepat satu per wallet — registry kanonis
///           kursi Season 2; amendemen keputusan 2026-11-22
///          , SPEC 9). Bonus per
///           pengguna = min(bagian pro-rata, +50% bagian vesting) —
///           cap ini mengikat SERAGAM: ia mengikat semua orang bila
///           total vesting Encore < 2× kolam (10 jt) dan tidak
///           mengikat siapa pun bila ≥ 10 jt, jadi hak dapat dihitung
///           dari agregat tanpa iterasi. Sisa kolam (termasuk potongan
///           cap) dibakar permissionless setelah jendela berakhir.
///         - Token & presale di-bind satu kali oleh deployer (pola
///           bind fase 1); router/factory PancakeSwap via konstruktor.
///         Kontrak IMMUTABLE: tanpa owner-withdraw / pause / upgrade.
contract SymphonySale {
    // ------------------------------------------------------------------
    // Konstanta ekonomi (SPEC 5/6/9)
    // ------------------------------------------------------------------
    uint256 public constant TOTAL_PASSES = 5_000;
    uint256 public constant MAX_PER_WALLET = 10;
    uint256 public constant MIN_REGISTRANTS = 500;
    uint256 public constant PRELUDE_WINDOW = 48 hours;
    uint256 public constant REFERRAL_REWARD = 5_000 ether;
    uint256 public constant REFERRAL_ALLOC = 25_000_000 ether;
    uint256 public constant POOL_OPUS = 175_000_000 ether;
    uint256 public constant POOL_USDT = 6_750 ether;
    uint256 public constant TREASURY_USDT = 750 ether;
    uint256 public constant ENCORE_POOL = 5_000_000 ether;
    uint256 public constant ENCORE_VEST_SECONDS = 60 days;
    uint256 public constant CLAIM_WINDOW = 30 days;
    uint256 public constant REFUND_WINDOW = 14 days;
    address public constant LP_BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    // ------------------------------------------------------------------
    // Parameter immutable
    // ------------------------------------------------------------------
    IAgentIdRegistrySale public immutable registry;
    IERC20Sale public immutable usdt;
    IPreludeForSale public immutable prelude;
    ISoundcheckForSale public immutable soundcheck;
    address public immutable treasuryVault;
    IPassForSale public immutable pass;
    IPancakeFactory public immutable pancakeFactory;
    IPancakeRouter public immutable pancakeRouter;
    /// @notice Buka sale (unix). Produksi: 1797076800.
    uint256 public immutable SALE_START;
    /// @notice Momen vonis (unix). Produksi: 1798632000.
    uint256 public immutable VERDICT;
    address public immutable deployer;

    IOpusSale public opus;
    IPresaleForSale public presale;
    IScherzoKeyForSale public scherzoKey;

    // ------------------------------------------------------------------
    // State sale
    // ------------------------------------------------------------------
    enum Outcome {
        Undecided,
        Graduated,
        Failed
    }
    Outcome public outcome;
    uint256 public totalSold;
    /// @notice Momen sale efektif dibuka (kedua gerbang pertama kali
    ///         terpenuhi); 0 = belum dibuka.
    uint256 public openedAt;
    /// @notice Pembelian primer kumulatif per alamat (dasar cap 10
    ///         & syarat bonus konversi distributor).
    mapping(address => uint256) public primaryPurchases;
    mapping(address => uint256) public referralAccrued;
    uint256 public totalReferralAccrued;

    // ------------------------------------------------------------------
    // State Encore
    // ------------------------------------------------------------------
    struct EncorePosition {
        uint128 amount;
        uint128 withdrawn;
        uint64 start;
    }
    mapping(address => EncorePosition[]) private _encorePositions;
    mapping(address => uint256) public totalEncoreVestedOf;
    uint256 public totalEncoreVested;
    mapping(address => bool) public encoreBonusClaimed;
    bool public encoreRemainderBurned;
    /// @notice Hitungan Pass yang diklaim lewat jalur Encore per
    ///         alamat (SPEC 9/13) — bukti internal kontrak ini.
    ///         Registry KANONIS kursinya adalah kontrak ScherzoKey:
    ///         tepat satu kunci soulbound per wallet, diterbitkan pada
    ///         Encore pertama wallet itu (lihat claimEncore).
    mapping(address => uint256) public scherzoOvertureSeats;

    // ------------------------------------------------------------------
    // Events
    // ------------------------------------------------------------------
    event TokenBound(address indexed token);
    event PresaleBound(address indexed presale);
    event ScherzoKeyBound(address indexed key);
    event SaleOpened(uint256 openedAt);
    event PassBought(address indexed buyer, uint256 count, uint256 totalPaid, address referrer);
    event Graduated(uint256 poolUsdt, uint256 presaleToPool, uint256 soundcheckSwept, uint256 referralBurned);
    event Failed(uint256 totalSold, uint256 refundEnd);
    event Refunded(address indexed buyer, uint256 tokenId, uint256 amount);
    event PremiereClaimed(address indexed holder, uint256 tokenId, uint256 amount);
    event EncoreElected(address indexed holder, uint256 tokenId, uint256 immediate, uint256 vested);
    event EncoreWithdrawn(address indexed holder, uint256 amount);
    event EncoreBonusClaimed(address indexed holder, uint256 amount);
    event EncoreRemainderBurned(uint256 amount);
    event ReferralClaimed(address indexed referrer, uint256 amount);

    constructor(
        address registry_,
        address usdt_,
        address prelude_,
        address soundcheck_,
        address treasuryVault_,
        address pass_,
        address pancakeFactory_,
        address pancakeRouter_,
        uint256 saleStart_,
        uint256 verdict_
    ) {
        require(registry_ != address(0), "SymphonySale: registry zero address");
        require(usdt_ != address(0), "SymphonySale: usdt zero address");
        require(prelude_ != address(0), "SymphonySale: prelude zero address");
        require(soundcheck_ != address(0), "SymphonySale: soundcheck zero address");
        require(treasuryVault_ != address(0), "SymphonySale: vault zero address");
        require(pass_ != address(0), "SymphonySale: pass zero address");
        require(pancakeFactory_ != address(0), "SymphonySale: factory zero address");
        require(pancakeRouter_ != address(0), "SymphonySale: router zero address");
        require(saleStart_ < verdict_, "SymphonySale: bad window");
        registry = IAgentIdRegistrySale(registry_);
        usdt = IERC20Sale(usdt_);
        prelude = IPreludeForSale(prelude_);
        soundcheck = ISoundcheckForSale(soundcheck_);
        treasuryVault = treasuryVault_;
        pass = IPassForSale(pass_);
        pancakeFactory = IPancakeFactory(pancakeFactory_);
        pancakeRouter = IPancakeRouter(pancakeRouter_);
        SALE_START = saleStart_;
        VERDICT = verdict_;
        deployer = msg.sender;
    }

    // ------------------------------------------------------------------
    // Binding satu-kali oleh deployer
    // ------------------------------------------------------------------
    function bindToken(address token_) external {
        require(msg.sender == deployer, "SymphonySale: not the deployer");
        require(address(opus) == address(0), "SymphonySale: token already bound");
        require(token_ != address(0), "SymphonySale: token zero address");
        opus = IOpusSale(token_);
        emit TokenBound(token_);
    }

    function bindPresale(address presale_) external {
        require(msg.sender == deployer, "SymphonySale: not the deployer");
        require(address(presale) == address(0), "SymphonySale: presale already bound");
        require(presale_ != address(0), "SymphonySale: presale zero address");
        presale = IPresaleForSale(presale_);
        emit PresaleBound(presale_);
    }

    function bindScherzoKey(address key_) external {
        require(msg.sender == deployer, "SymphonySale: not the deployer");
        require(address(scherzoKey) == address(0), "SymphonySale: key already bound");
        require(key_ != address(0), "SymphonySale: key zero address");
        scherzoKey = IScherzoKeyForSale(key_);
        emit ScherzoKeyBound(key_);
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------
    function graduated() external view returns (bool) {
        return outcome == Outcome.Graduated;
    }

    function failed() external view returns (bool) {
        return outcome == Outcome.Failed;
    }

    function refundEnd() external view returns (uint256) {
        return VERDICT + REFUND_WINDOW;
    }

    function claimWindowEnd() external view returns (uint256) {
        return VERDICT + CLAIM_WINDOW;
    }

    /// @notice Tier, harga USDT & hak klaim OPUS untuk Pass pada posisi
    ///         penjualan `position` (1-based, dari totalSold).
    function tierFor(uint256 position) public pure returns (uint8 tier, uint256 price, uint256 claim) {
        require(position >= 1 && position <= TOTAL_PASSES, "SymphonySale: bad position");
        if (position <= 1_500) return (1, 1 ether, 78_000 ether);
        if (position <= 3_500) return (2, 1.5 ether, 65_000 ether);
        return (3, 2 ether, 52_000 ether);
    }

    /// @notice Hak klaim OPUS menurut nomor tier.
    function claimOfTier(uint8 tier) public pure returns (uint256) {
        if (tier == 1) return 78_000 ether;
        if (tier == 2) return 65_000 ether;
        if (tier == 3) return 52_000 ether;
        return 0;
    }

    function encorePositionCount(address user) external view returns (uint256) {
        return _encorePositions[user].length;
    }

    // ------------------------------------------------------------------
    // Pembukaan sale (gerbang tanggal + gerbang 500)
    // ------------------------------------------------------------------
    /// @notice Tandai sale terbuka begitu kedua gerbang terpenuhi.
    ///         Permissionless. Dipanggil juga secara internal oleh buy().
    function openSale() public {
        require(openedAt == 0, "SymphonySale: already opened");
        require(block.timestamp >= SALE_START, "SymphonySale: sale has not started");
        require(prelude.count() >= MIN_REGISTRANTS, "SymphonySale: Prelude gate not met");
        openedAt = block.timestamp;
        emit SaleOpened(openedAt);
    }

    // ------------------------------------------------------------------
    // Pembelian primer
    // ------------------------------------------------------------------
    /// @notice Beli `count` Pass (tier mengikuti urutan penjualan,
    ///         termasuk melintasi batas tier di dalam satu transaksi).
    ///         `referrer` boleh address(0). USDT ditarik via transferFrom.
    function buy(uint256 count, address referrer) external {
        require(outcome == Outcome.Undecided, "SymphonySale: sale decided");
        require(block.timestamp < VERDICT, "SymphonySale: verdict reached");
        require(count > 0, "SymphonySale: zero count");
        if (openedAt == 0) openSale();
        require(registry.balanceOf(msg.sender) > 0, "SymphonySale: not an Agent ID holder");
        if (block.timestamp < openedAt + PRELUDE_WINDOW) {
            require(prelude.isRegistered(msg.sender), "SymphonySale: Prelude registrants only");
        }
        require(primaryPurchases[msg.sender] + count <= MAX_PER_WALLET, "SymphonySale: wallet cap exceeded");
        require(totalSold + count <= TOTAL_PASSES, "SymphonySale: not enough Passes left");

        bool hasReferrer = referrer != address(0);
        if (hasReferrer) {
            require(referrer != msg.sender, "SymphonySale: self-referral");
            require(pass.balanceOf(referrer) >= 1, "SymphonySale: referrer holds no Pass");
        }

        uint256 totalPrice = 0;
        for (uint256 i = 0; i < count; i++) {
            (, uint256 price, ) = tierFor(totalSold + 1 + i);
            totalPrice += price;
        }
        require(usdt.transferFrom(msg.sender, address(this), totalPrice), "SymphonySale: payment failed");

        for (uint256 i = 0; i < count; i++) {
            (uint8 tier, uint256 price, ) = tierFor(totalSold + 1);
            totalSold += 1;
            pass.mint(msg.sender, tier, price);
        }
        primaryPurchases[msg.sender] += count;

        if (hasReferrer) {
            uint256 accrued = REFERRAL_REWARD * count;
            referralAccrued[referrer] += accrued;
            totalReferralAccrued += accrued;
        }
        emit PassBought(msg.sender, count, totalPrice, referrer);
    }

    // ------------------------------------------------------------------
    // Vonis — finalize() permissionless, hanya sejak VERDICT
    // ------------------------------------------------------------------
    function finalize() external {
        require(outcome == Outcome.Undecided, "SymphonySale: already decided");
        require(block.timestamp >= VERDICT, "SymphonySale: verdict not reached");
        if (totalSold == TOTAL_PASSES) {
            _graduate();
        } else {
            _fail();
        }
    }

    function _graduate() internal {
        outcome = Outcome.Graduated;

        // 90% hasil presale masuk ke kontrak ini untuk pool (10% ke
        // vault ditangani OpusPresale di dalam sweepProceeds).
        uint256 presaleToPool = 0;
        if (address(presale) != address(0)) {
            presaleToPool = presale.sweepProceeds();
        }

        // Sapu bagian pool perbaikan streak Soundcheck ke kontrak ini.
        uint256 usdtBefore = usdt.balanceOf(address(this));
        soundcheck.markGraduated(address(this));
        uint256 soundcheckSwept = usdt.balanceOf(address(this)) - usdtBefore;

        // 10% raise ke TreasuryVault.
        require(usdt.transfer(treasuryVault, TREASURY_USDT), "SymphonySale: treasury transfer failed");

        // Tanam pool PancakeSwap V2; LP dibakar ke alamat mati.
        uint256 poolUsdt = POOL_USDT + presaleToPool + soundcheckSwept;
        address pair = pancakeFactory.getPair(address(opus), address(usdt));
        if (pair == address(0)) {
            pair = pancakeFactory.createPair(address(opus), address(usdt));
        }
        require(opus.approve(address(pancakeRouter), POOL_OPUS), "SymphonySale: opus approve failed");
        require(usdt.approve(address(pancakeRouter), poolUsdt), "SymphonySale: usdt approve failed");
        pancakeRouter.addLiquidity(
            address(opus),
            address(usdt),
            POOL_OPUS,
            poolUsdt,
            POOL_OPUS,
            poolUsdt,
            address(this),
            block.timestamp
        );
        uint256 lp = IPancakePair(pair).balanceOf(address(this));
        if (lp > 0) {
            require(IPancakePair(pair).transfer(LP_BURN_ADDRESS, lp), "SymphonySale: LP burn failed");
        }

        // Sisa alokasi referral yang tidak terakru dibakar.
        uint256 referralBurned = REFERRAL_ALLOC - totalReferralAccrued;
        if (referralBurned > 0) {
            opus.burn(referralBurned);
        }
        emit Graduated(poolUsdt, presaleToPool, soundcheckSwept, referralBurned);
    }

    function _fail() internal {
        outcome = Outcome.Failed;
        soundcheck.markFailed(VERDICT + REFUND_WINDOW);
        emit Failed(totalSold, VERDICT + REFUND_WINDOW);
    }

    // ------------------------------------------------------------------
    // Refund (jalur gagal) — burn-to-settle, satu Pass per transaksi
    // ------------------------------------------------------------------
    /// @notice Bakar satu Pass & terima kembali paidOf-nya dalam USDT.
    ///         Hanya selama jendela refund [VERDICT, VERDICT + 14 hari].
    ///         Tanpa syarat Agent ID (SPEC 9).
    function refund(uint256 tokenId) external {
        require(outcome == Outcome.Failed, "SymphonySale: sale did not fail");
        require(block.timestamp <= VERDICT + REFUND_WINDOW, "SymphonySale: refund window closed");
        require(pass.ownerOf(tokenId) == msg.sender, "SymphonySale: not the holder");
        uint256 amount = pass.paidOf(tokenId);
        pass.burn(tokenId);
        require(usdt.transfer(msg.sender, amount), "SymphonySale: refund transfer failed");
        emit Refunded(msg.sender, tokenId, amount);
    }

    // ------------------------------------------------------------------
    // Burn-to-claim (jalur lulus) — selalu satu tokenId per transaksi
    // ------------------------------------------------------------------
    /// @notice PREMIERE: bakar satu Pass → 100% hak klaim tier-nya,
    ///         langsung. Tanpa tenggat. Tanpa syarat Agent ID.
    function claimPremiere(uint256 tokenId) external {
        require(outcome == Outcome.Graduated, "SymphonySale: not graduated");
        require(pass.ownerOf(tokenId) == msg.sender, "SymphonySale: not the holder");
        uint256 amount = claimOfTier(pass.tierOf(tokenId));
        pass.burn(tokenId);
        require(opus.transfer(msg.sender, amount), "SymphonySale: claim transfer failed");
        emit PremiereClaimed(msg.sender, tokenId, amount);
    }

    /// @notice ENCORE: bakar satu Pass → 50% langsung + 50% vesting
    ///         linear 60 hari + hak bonus kolam Encore + kursi Overture
    ///         Scherzo tercatat. Pada Encore PERTAMA wallet ini,
    ///         kunci SCHERZO soulbound diterbitkan untuknya (tepat
    ///         satu per wallet — registry kanonis kursi Season 2,
    ///         SPEC 9). Hanya dalam jendela 30 hari sejak vonis.
    ///         Tanpa syarat Agent ID.
    function claimEncore(uint256 tokenId) external {
        require(outcome == Outcome.Graduated, "SymphonySale: not graduated");
        require(block.timestamp <= VERDICT + CLAIM_WINDOW, "SymphonySale: Encore window closed");
        require(pass.ownerOf(tokenId) == msg.sender, "SymphonySale: not the holder");
        uint256 claim = claimOfTier(pass.tierOf(tokenId));
        uint256 immediate = claim / 2;
        uint256 vested = claim - immediate;
        pass.burn(tokenId);
        _encorePositions[msg.sender].push(
            EncorePosition({amount: uint128(vested), withdrawn: 0, start: uint64(block.timestamp)})
        );
        totalEncoreVestedOf[msg.sender] += vested;
        totalEncoreVested += vested;
        scherzoOvertureSeats[msg.sender] += 1;
        // Kunci SCHERZO: hanya pada Encore pertama wallet ini. Penjaga
        // hasKey memastikan Encore berikutnya tidak pernah memanggil
        // mint (yang akan revert di kontrak kunci), sehingga klaim
        // Encore yang sah tidak pernah gagal karena kunci.
        if (address(scherzoKey) != address(0) && !scherzoKey.hasKey(msg.sender)) {
            scherzoKey.mintKey(msg.sender);
        }
        require(opus.transfer(msg.sender, immediate), "SymphonySale: immediate transfer failed");
        emit EncoreElected(msg.sender, tokenId, immediate, vested);
    }

    /// @notice Tarik bagian vesting Encore yang sudah matang (linear
    ///         60 hari per posisi). Tanpa tenggat.
    function withdrawEncore() external {
        EncorePosition[] storage positions = _encorePositions[msg.sender];
        uint256 due = 0;
        for (uint256 i = 0; i < positions.length; i++) {
            EncorePosition storage p = positions[i];
            uint256 elapsed = block.timestamp - p.start;
            uint256 vestedNow = elapsed >= ENCORE_VEST_SECONDS
                ? p.amount
                : (uint256(p.amount) * elapsed) / ENCORE_VEST_SECONDS;
            if (vestedNow > p.withdrawn) {
                due += vestedNow - p.withdrawn;
                p.withdrawn = uint128(vestedNow);
            }
        }
        require(due > 0, "SymphonySale: nothing vested yet");
        require(opus.transfer(msg.sender, due), "SymphonySale: withdraw transfer failed");
        emit EncoreWithdrawn(msg.sender, due);
    }

    /// @notice Hak bonus kolam Encore satu alamat (lihat header:
    ///         cap +50% mengikat seragam menurut agregat).
    function encoreBonusOf(address user) public view returns (uint256) {
        uint256 vested = totalEncoreVestedOf[user];
        if (vested == 0 || totalEncoreVested == 0) return 0;
        if (totalEncoreVested >= 2 * ENCORE_POOL) {
            return (ENCORE_POOL * vested) / totalEncoreVested;
        }
        return vested / 2;
    }

    /// @notice Klaim bonus kolam Encore — setelah jendela pilih Encore
    ///         (30 hari sejak vonis) berakhir. Tanpa tenggat klaim.
    function claimEncoreBonus() external {
        require(outcome == Outcome.Graduated, "SymphonySale: not graduated");
        require(block.timestamp > VERDICT + CLAIM_WINDOW, "SymphonySale: Encore window still open");
        require(!encoreBonusClaimed[msg.sender], "SymphonySale: bonus already claimed");
        uint256 bonus = encoreBonusOf(msg.sender);
        require(bonus > 0, "SymphonySale: no Encore bonus");
        encoreBonusClaimed[msg.sender] = true;
        require(opus.transfer(msg.sender, bonus), "SymphonySale: bonus transfer failed");
        emit EncoreBonusClaimed(msg.sender, bonus);
    }

    /// @notice Bakar sisa kolam Encore yang tidak terbagi (termasuk
    ///         potongan cap) setelah jendela pilih berakhir.
    ///         Permissionless, sekali. Hak bonus yang belum diklaim
    ///         TIDAK ikut terbakar (bukan bagian dari sisa ini).
    function burnEncoreRemainder() external {
        require(outcome == Outcome.Graduated, "SymphonySale: not graduated");
        require(block.timestamp > VERDICT + CLAIM_WINDOW, "SymphonySale: Encore window still open");
        require(!encoreRemainderBurned, "SymphonySale: remainder already burned");
        encoreRemainderBurned = true;
        uint256 remainder = totalEncoreVested >= 2 * ENCORE_POOL
            ? 0
            : ENCORE_POOL - totalEncoreVested / 2;
        if (remainder > 0) {
            opus.burn(remainder);
        }
        emit EncoreRemainderBurned(remainder);
    }

    // ------------------------------------------------------------------
    // Klaim referral sale
    // ------------------------------------------------------------------
    /// @notice Klaim OPUS referral yang terakru (5.000 per Pass).
    ///         Setelah graduation; tanpa tenggat; sekali per saldo.
    function claimReferral() external {
        require(outcome == Outcome.Graduated, "SymphonySale: not graduated");
        uint256 amount = referralAccrued[msg.sender];
        require(amount > 0, "SymphonySale: no referral balance");
        referralAccrued[msg.sender] = 0;
        require(opus.transfer(msg.sender, amount), "SymphonySale: referral transfer failed");
        emit ReferralClaimed(msg.sender, amount);
    }
}
