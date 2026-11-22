// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Interface ERC-20 minimal (USDT & OPUS, 18 desimal).
interface IERC20Pre {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @notice Interface registry Agent ID resmi. Gate = balanceOf > 0.
interface IAgentIdRegistryPre {
    function balanceOf(address owner) external view returns (uint256);
}

/// @notice Interface baca kontrak sale (gerbang buka + hasil vonis).
interface ISaleForPresale {
    function totalSold() external view returns (uint256);
    function graduated() external view returns (bool);
    function failed() external view returns (bool);
}

/// @title OpusPresale — presale $OPUS langsung (tanpa Pass)
/// @notice SPEC-SYMPHONY.md bagian 5A & 10 (fase 2):
///         - 5 jt OPUS dari JATAH TIM dicetak OpusToken ke kontrak ini.
///         - Harga tetap $0,0001/OPUS: 1 USDT = 10.000 OPUS. Raise
///           maksimum 500 USDT. Batas per wallet: 50 USDT kumulatif.
///         - BUKA tepat saat SymphonySale.totalSold mencapai 1.500
///           (Tier 1 habis — Tier 2 terbuka); sebelum itu buy() revert.
///           Berakhir pada vonis sale utama (30 Des 2026 12:00 UTC,
///           dibaca dari konteks sale) atau saat 5 jt habis. Bila Tier 1
///           tidak pernah habis, presale tidak pernah buka.
///         - Gate Agent ID di pintu masuk; TANPA prioritas Prelude —
///           semua pemegang Agent ID setara, termasuk selama fase 48
///           jam Prelude pada sale utama.
///         - USDT di-escrow di kontrak ini. Nasib mengikuti vonis sale:
///           LULUS → sweepProceeds() dipanggil SymphonySale saat
///           finalize: 90% hasil ke sale (ikut ditanam ke pool), 10%
///           ke TreasuryVault; OPUS pembeli bisa diklaim utuh
///           (claimOpus, tanpa vesting, tanpa burn, tanpa tenggat);
///           OPUS tak terjual kembali ke TeamVesting (settleUnsold).
///           GAGAL → claimRefund() mengembalikan 100% USDT kontribusi
///           (tanpa tenggat — SPEC tidak menetapkan jendela refund
///           presale); OPUS tak terjual tetap kembali ke TeamVesting.
///         - Penyampaian OPUS & refund berbentuk klaim oleh pembeli
///           (pull) — hak & jumlahnya persis seperti SPEC; pola pull
///           menghindari loop pengiriman yang bisa tersangkut gas.
///         - Alamat token di-bind satu kali oleh deployer (pola fase 1).
///         Kontrak IMMUTABLE: tanpa owner-withdraw / pause / upgrade.
contract OpusPresale {
    /// @notice OPUS per 1 USDT (harga $0,0001/OPUS).
    uint256 public constant OPUS_PER_USDT = 10_000;
    /// @notice Batas kontribusi kumulatif per wallet: 50 USDT.
    uint256 public constant WALLET_CAP = 50 ether;
    /// @notice Total OPUS yang dijual di presale ini: 5 jt.
    uint256 public constant PRESALE_OPUS = 5_000_000 ether;
    /// @notice totalSold sale utama yang membuka presale (Tier 1 habis).
    uint256 public constant OPEN_AT_TOTAL_SOLD = 1_500;

    IAgentIdRegistryPre public immutable registry;
    IERC20Pre public immutable usdt;
    ISaleForPresale public immutable sale;
    address public immutable treasuryVault;
    address public immutable vesting;
    /// @notice Batas akhir presale = momen vonis (unix). Produksi:
    ///         1798632000 (30 Des 2026 12:00:00 UTC).
    uint256 public immutable verdict;
    address public immutable deployer;
    IERC20Pre public opus;

    /// @notice Kontribusi USDT per pembeli (yang belum diselesaikan).
    mapping(address => uint256) public contributionOf;
    /// @notice OPUS yang menjadi hak pembeli (= kontribusi × 10.000).
    mapping(address => uint256) public opusOwedOf;
    uint256 public totalRaised;
    uint256 public opusSold;
    bool public proceedsSwept;
    bool public unsoldSettled;

    event TokenBound(address indexed token);
    event Bought(address indexed buyer, uint256 usdtAmount, uint256 opusAmount);
    event ProceedsSwept(uint256 toPool, uint256 toVault);
    event OpusClaimed(address indexed buyer, uint256 amount);
    event Refunded(address indexed buyer, uint256 amount);
    event UnsoldReturned(address indexed vesting, uint256 amount);

    constructor(
        address registry_,
        address usdt_,
        address sale_,
        address treasuryVault_,
        address vesting_,
        uint256 verdict_
    ) {
        require(registry_ != address(0), "OpusPresale: registry zero address");
        require(usdt_ != address(0), "OpusPresale: usdt zero address");
        require(sale_ != address(0), "OpusPresale: sale zero address");
        require(treasuryVault_ != address(0), "OpusPresale: vault zero address");
        require(vesting_ != address(0), "OpusPresale: vesting zero address");
        require(verdict_ > block.timestamp, "OpusPresale: verdict in the past");
        registry = IAgentIdRegistryPre(registry_);
        usdt = IERC20Pre(usdt_);
        sale = ISaleForPresale(sale_);
        treasuryVault = treasuryVault_;
        vesting = vesting_;
        verdict = verdict_;
        deployer = msg.sender;
    }

    /// @notice Bind alamat OpusToken — satu kali, hanya deployer.
    function bindToken(address token_) external {
        require(msg.sender == deployer, "OpusPresale: not the deployer");
        require(address(opus) == address(0), "OpusPresale: token already bound");
        require(token_ != address(0), "OpusPresale: token zero address");
        opus = IERC20Pre(token_);
        emit TokenBound(token_);
    }

    /// @notice True bila presale sedang terbuka untuk pembelian.
    function isOpen() public view returns (bool) {
        return
            sale.totalSold() >= OPEN_AT_TOTAL_SOLD &&
            block.timestamp < verdict &&
            opusSold < PRESALE_OPUS;
    }

    /// @notice Beli OPUS presale dengan USDT (escrow). Gate Agent ID;
    ///         tanpa prioritas Prelude. `usdtAmount` dalam 18 desimal.
    function buy(uint256 usdtAmount) external {
        require(usdtAmount > 0, "OpusPresale: zero amount");
        require(isOpen(), "OpusPresale: not open");
        require(registry.balanceOf(msg.sender) > 0, "OpusPresale: not an Agent ID holder");
        require(
            contributionOf[msg.sender] + usdtAmount <= WALLET_CAP,
            "OpusPresale: wallet cap exceeded"
        );
        uint256 opusAmount = usdtAmount * OPUS_PER_USDT;
        require(opusSold + opusAmount <= PRESALE_OPUS, "OpusPresale: exceeds remaining allocation");
        contributionOf[msg.sender] += usdtAmount;
        opusOwedOf[msg.sender] += opusAmount;
        totalRaised += usdtAmount;
        opusSold += opusAmount;
        require(
            usdt.transferFrom(msg.sender, address(this), usdtAmount),
            "OpusPresale: payment failed"
        );
        emit Bought(msg.sender, usdtAmount, opusAmount);
    }

    /// @notice Dipanggil SymphonySale saat finalize (jalur lulus):
    ///         90% hasil USDT ke sale (untuk pool), 10% ke TreasuryVault.
    ///         Sekali saja. Mengembalikan jumlah yang dikirim ke sale.
    function sweepProceeds() external returns (uint256 toPool) {
        require(msg.sender == address(sale), "OpusPresale: only the sale");
        require(sale.graduated(), "OpusPresale: sale not graduated");
        require(!proceedsSwept, "OpusPresale: proceeds already swept");
        proceedsSwept = true;
        uint256 toVault = totalRaised / 10;
        toPool = totalRaised - toVault;
        if (toVault > 0) {
            require(usdt.transfer(treasuryVault, toVault), "OpusPresale: vault transfer failed");
        }
        if (toPool > 0) {
            require(usdt.transfer(address(sale), toPool), "OpusPresale: pool transfer failed");
        }
        emit ProceedsSwept(toPool, toVault);
    }

    /// @notice Kembalikan OPUS yang tidak terjual ke TeamVesting.
    ///         Permissionless, setelah vonis (sale lulus ATAU gagal).
    function settleUnsold() external {
        require(sale.graduated() || sale.failed(), "OpusPresale: verdict not reached");
        require(!unsoldSettled, "OpusPresale: unsold already settled");
        require(address(opus) != address(0), "OpusPresale: token not bound");
        unsoldSettled = true;
        uint256 unsold = PRESALE_OPUS - opusSold;
        if (unsold > 0) {
            require(opus.transfer(vesting, unsold), "OpusPresale: unsold transfer failed");
        }
        emit UnsoldReturned(vesting, unsold);
    }

    /// @notice Klaim OPUS presale utuh setelah sale lulus & hasil
    ///         disapu. Sekali per pembeli; tanpa tenggat.
    function claimOpus() external {
        require(proceedsSwept, "OpusPresale: proceeds not swept yet");
        uint256 amount = opusOwedOf[msg.sender];
        require(amount > 0, "OpusPresale: nothing to claim");
        opusOwedOf[msg.sender] = 0;
        require(opus.transfer(msg.sender, amount), "OpusPresale: claim transfer failed");
        emit OpusClaimed(msg.sender, amount);
    }

    /// @notice Klaim kembali 100% USDT kontribusi setelah sale gagal.
    ///         Sekali per pembeli; tanpa tenggat (SPEC 5A tidak
    ///         menetapkan jendela refund presale).
    function claimRefund() external {
        require(sale.failed(), "OpusPresale: sale did not fail");
        uint256 amount = contributionOf[msg.sender];
        require(amount > 0, "OpusPresale: nothing to refund");
        contributionOf[msg.sender] = 0;
        opusOwedOf[msg.sender] = 0;
        require(usdt.transfer(msg.sender, amount), "OpusPresale: refund transfer failed");
        emit Refunded(msg.sender, amount);
    }
}
