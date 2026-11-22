// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Interface OPUS (ERC-20 + burn saldo sendiri).
interface IERC20Dist {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function burn(uint256 amount) external;
}

/// @notice Interface PreludeRegistry (status registrasi & Pass).
interface IPreludeForDist {
    function isRegistered(address user) external view returns (bool);
    function passOf(address user) external view returns (uint256);
}

/// @notice Interface Soundcheck (kepemilikan Magnum saat ini).
interface ISoundcheckForDist {
    function hasMagnum(address user) external view returns (bool);
}

/// @notice Interface kontrak sale (hasil vonis + pembelian primer).
interface ISaleForDist {
    function graduated() external view returns (bool);
    function failed() external view returns (bool);
    function primaryPurchases(address user) external view returns (uint256);
    function VERDICT() external view returns (uint256);
}

/// @title OpusDistributor — distributor Merkle klaim komunitas SYMPHONY
/// @notice SPEC-SYMPHONY.md bagian 3, 4, 6, 9 & 10 (fase 2). Satu
///         kontrak, tiga kolam dari alokasi komunitas 50 jt OPUS yang
///         dicetak OpusToken ke kontrak ini:
///           Pool 0 PRELUDE_FLAT — bonus konversi rata 15 jt + sisa
///             kolam Soundcheck yang mengalir ke sini (SPEC 4). Daun
///             Merkle dibangun dari pendaftar Prelude yang membeli
///             ≥1 Pass. Klaim mensyaratkan Prelude Pass SUDAH dibakar
///             pemanggil (burn-to-claim, SPEC 9): Pass soulbound tidak
///             bisa berpindah, jadi isRegistered && passOf == 0 hanya
///             mungkin tercapai lewat burn. primaryPurchases ≥ 1 juga
///             diperiksa on-chain dari kontrak sale.
///           Pool 1 PRELUDE_REFERRAL — referral fase 1, 5 jt: daun =
///             (referrer, min(referralCount, 50) × 100 OPUS) dari
///             catatan on-chain PreludeRegistry. Tanpa syarat burn
///             (SPEC 3/9 tidak memintanya untuk klaim referral).
///           Pool 2 SOUNDCHECK — 30 jt pro-rata penyelesai set lengkap,
///             cap 60.000/orang dihitung saat pohon dibangun. Klaim
///             mensyaratkan Magnum SUDAH dibakar pemanggil: Magnum
///             hanya bisa berpindah lewat market dan market tutup pada
///             vonis, jadi pemegang sah saat vonis yang tidak lagi
///             memegang Magnum (hasMagnum == false) pastilah telah
///             membakarnya (burn-to-claim, SPEC 9).
///         - Akar Merkle + total hak (entitlement) tiap kolam ditetapkan
///           deployer SATU KALI setelah vonis (data snapshot hanya ada
///           saat itu; pola satu-kali yang sama dengan bind fase 1).
///           Batas on-chain: Soundcheck ≤ 30 jt; Referral ≤ 5 jt; Flat
///           ≤ 15 jt + (30 jt − entitlement Soundcheck) — aliran sisa
///           Soundcheck ke kolam rata ditegakkan sebagai identitas
///           akuntansi di sini; total ketiganya ≤ 50 jt.
///         - Klaim hanya bila sale LULUS, dalam jendela 30 hari sejak
///           vonis (30 Des 2026 → 29 Jan 2027 12:00 UTC). Sekali per
///           akun per kolam. Sisa tiap kolam (entitlement − terklaim)
///           dibakar permissionless setelah jendela berakhir — atau
///           setelah jendela refund bila sale GAGAL (seluruh alokasi
///           komunitas hangus, tidak ada klaim yang pernah membuka).
///         - Daun: keccak256(abi.encode(account, amount)) di-hash dua
///           kali (pola OpenZeppelin); verifikasi pasangan terurut.
///         Kontrak IMMUTABLE: tanpa owner-withdraw / pause / upgrade;
///         hak istimewa hanya penetapan akar satu-kali oleh deployer
///         dan bindToken satu-kali.
contract OpusDistributor {
    uint8 public constant POOL_PRELUDE_FLAT = 0;
    uint8 public constant POOL_PRELUDE_REFERRAL = 1;
    uint8 public constant POOL_SOUNDCHECK = 2;

    uint256 public constant COMMUNITY_TOTAL = 50_000_000 ether;
    uint256 public constant SOUNDCHECK_POOL = 30_000_000 ether;
    uint256 public constant PRELUDE_FLAT_POOL = 15_000_000 ether;
    uint256 public constant PRELUDE_REFERRAL_POOL = 5_000_000 ether;
    uint256 public constant CLAIM_WINDOW = 30 days;

    IPreludeForDist public immutable prelude;
    ISoundcheckForDist public immutable soundcheck;
    ISaleForDist public immutable sale;
    address public immutable deployer;
    IERC20Dist public opus;

    struct Pool {
        bytes32 root;
        uint256 entitlement;
        uint256 claimedTotal;
        bool remainderBurned;
    }
    mapping(uint8 => Pool) public pools;
    mapping(uint8 => mapping(address => bool)) public claimed;

    event TokenBound(address indexed token);
    event PoolSet(uint8 indexed pool, bytes32 root, uint256 entitlement);
    event Claimed(uint8 indexed pool, address indexed account, uint256 amount);
    event RemainderBurned(uint8 indexed pool, uint256 amount);

    constructor(address prelude_, address soundcheck_, address sale_) {
        require(prelude_ != address(0), "OpusDistributor: prelude zero address");
        require(soundcheck_ != address(0), "OpusDistributor: soundcheck zero address");
        require(sale_ != address(0), "OpusDistributor: sale zero address");
        prelude = IPreludeForDist(prelude_);
        soundcheck = ISoundcheckForDist(soundcheck_);
        sale = ISaleForDist(sale_);
        deployer = msg.sender;
    }

    /// @notice Bind alamat OpusToken — satu kali, hanya deployer.
    function bindToken(address token_) external {
        require(msg.sender == deployer, "OpusDistributor: not the deployer");
        require(address(opus) == address(0), "OpusDistributor: token already bound");
        require(token_ != address(0), "OpusDistributor: token zero address");
        opus = IERC20Dist(token_);
        emit TokenBound(token_);
    }

    // ------------------------------------------------------------------
    // Penetapan kolam (satu kali per kolam, oleh deployer, pasca-vonis)
    // ------------------------------------------------------------------
    function setPool(uint8 pool, bytes32 root, uint256 entitlement) external {
        require(msg.sender == deployer, "OpusDistributor: not the deployer");
        require(pool <= POOL_SOUNDCHECK, "OpusDistributor: bad pool");
        require(pools[pool].root == bytes32(0), "OpusDistributor: pool already set");
        require(root != bytes32(0), "OpusDistributor: zero root");
        require(block.timestamp >= sale.VERDICT(), "OpusDistributor: snapshot exists only at the verdict");
        if (pool == POOL_SOUNDCHECK) {
            require(entitlement <= SOUNDCHECK_POOL, "OpusDistributor: soundcheck entitlement too big");
        } else if (pool == POOL_PRELUDE_REFERRAL) {
            require(entitlement <= PRELUDE_REFERRAL_POOL, "OpusDistributor: referral entitlement too big");
        } else {
            // Sisa Soundcheck mengalir ke kolam rata (SPEC 4): hak
            // kolam rata ≤ 15 jt + (30 jt − hak Soundcheck yang ditetapkan).
            uint256 scEntitlement = pools[POOL_SOUNDCHECK].entitlement;
            require(
                entitlement <= PRELUDE_FLAT_POOL + (SOUNDCHECK_POOL - scEntitlement),
                "OpusDistributor: flat entitlement too big"
            );
        }
        uint256 total = pools[0].entitlement + pools[1].entitlement + pools[2].entitlement + entitlement;
        require(total <= COMMUNITY_TOTAL, "OpusDistributor: community total exceeded");
        pools[pool].root = root;
        pools[pool].entitlement = entitlement;
        emit PoolSet(pool, root, entitlement);
    }

    // ------------------------------------------------------------------
    // Klaim
    // ------------------------------------------------------------------
    /// @notice Klaim hak dari satu kolam dengan bukti Merkle. Daun
    ///         mengikat (pemanggil, amount). Syarat per kolam sesuai
    ///         header kontrak. Sekali per akun per kolam.
    function claim(uint8 pool, uint256 amount, bytes32[] calldata proof) external {
        require(pool <= POOL_SOUNDCHECK, "OpusDistributor: bad pool");
        require(sale.graduated(), "OpusDistributor: sale did not graduate");
        require(block.timestamp <= sale.VERDICT() + CLAIM_WINDOW, "OpusDistributor: claim window closed");
        Pool storage p = pools[pool];
        require(p.root != bytes32(0), "OpusDistributor: pool not set");
        require(!claimed[pool][msg.sender], "OpusDistributor: already claimed");
        require(amount > 0, "OpusDistributor: zero amount");
        bytes32 leaf = keccak256(abi.encodePacked(keccak256(abi.encode(msg.sender, amount))));
        require(_verify(proof, p.root, leaf), "OpusDistributor: invalid proof");

        if (pool == POOL_PRELUDE_FLAT) {
            // Burn-to-claim: Prelude Pass wajib sudah dibakar.
            require(prelude.isRegistered(msg.sender), "OpusDistributor: not a Prelude registrant");
            require(prelude.passOf(msg.sender) == 0, "OpusDistributor: burn your Prelude Pass first");
            require(sale.primaryPurchases(msg.sender) >= 1, "OpusDistributor: never bought a Pass");
        } else if (pool == POOL_SOUNDCHECK) {
            // Burn-to-claim: Magnum wajib sudah dibakar (lihat header).
            require(!soundcheck.hasMagnum(msg.sender), "OpusDistributor: burn your Opus Magnum first");
        }
        // Pool referral Prelude: tanpa syarat burn (SPEC 3/9).

        claimed[pool][msg.sender] = true;
        p.claimedTotal += amount;
        require(opus.transfer(msg.sender, amount), "OpusDistributor: transfer failed");
        emit Claimed(pool, msg.sender, amount);
    }

    // ------------------------------------------------------------------
    // Bakar sisa kolam
    // ------------------------------------------------------------------
    /// @notice Bakar sisa satu kolam (entitlement − terklaim) dari
    ///         saldo kontrak ini. Permissionless; hanya jalur LULUS,
    ///         setelah jendela klaim 30 hari berakhir (SPEC 9).
    function burnRemainder(uint8 pool) external {
        require(pool <= POOL_SOUNDCHECK, "OpusDistributor: bad pool");
        Pool storage p = pools[pool];
        require(!p.remainderBurned, "OpusDistributor: remainder already burned");
        require(sale.graduated(), "OpusDistributor: sale did not graduate");
        require(block.timestamp > sale.VERDICT() + CLAIM_WINDOW, "OpusDistributor: claim window still open");
        p.remainderBurned = true;
        uint256 remainder = p.entitlement - p.claimedTotal;
        if (remainder > 0) {
            opus.burn(remainder);
        }
        emit RemainderBurned(pool, remainder);
    }

    /// @notice Jalur GAGAL: seluruh alokasi komunitas di kontrak ini
    ///         dibakar setelah jendela refund sale berakhir (vonis +
    ///         14 hari) — tidak ada klaim komunitas yang pernah membuka
    ///         bila sale gagal (SPEC 3/4/9). Permissionless, sekali.
    bool public failureBurned;
    event FailureBurned(uint256 amount);

    function burnAllOnFailure() external {
        require(sale.failed(), "OpusDistributor: sale did not fail");
        require(block.timestamp > sale.VERDICT() + 14 days, "OpusDistributor: refund window still open");
        require(!failureBurned, "OpusDistributor: already burned");
        failureBurned = true;
        uint256 balance = opus.balanceOf(address(this));
        if (balance > 0) {
            opus.burn(balance);
        }
        emit FailureBurned(balance);
    }

    // ------------------------------------------------------------------
    // Verifikasi Merkle (pasangan terurut, pola OpenZeppelin)
    // ------------------------------------------------------------------
    function _verify(bytes32[] calldata proof, bytes32 root, bytes32 leaf) internal pure returns (bool) {
        bytes32 h = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 sibling = proof[i];
            h = h < sibling
                ? keccak256(abi.encodePacked(h, sibling))
                : keccak256(abi.encodePacked(sibling, h));
        }
        return h == root;
    }
}
