// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Interface minimal OPUS (ERC-20).
interface IERC20Vest {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @notice Interface baca status sale (untuk jam graduation).
interface ISaleForVesting {
    function graduated() external view returns (bool);
    function VERDICT() external view returns (uint256);
}

/// @title TeamVesting — vesting jatah tim SYMPHONY (15 jt OPUS)
/// @notice SPEC-SYMPHONY.md bagian 5A, 6 & 10 (fase 2):
///         - 15 jt OPUS dicetak OpusToken ke kontrak ini saat deploy.
///         - Jam berjalan sejak GRADUATION (= momen vonis 30 Des 2026
///           12:00 UTC, dibaca dari kontrak sale): cliff 30 hari —
///           sebelum hari ke-30 TIDAK ada yang bisa diambil; mulai hari
///           ke-30 mengalir LINEAR dari nol selama 365 hari; lunas pada
///           hari ke-395 sejak graduation. Bila sale gagal, graduation
///           tidak pernah terjadi dan tidak ada yang pernah terlepas
///           (konsisten: seluruh jadwal berjangkar pada graduation).
///         - Penerima SATU-SATUNYA: wallet treasury (immutable di
///           konstruktor; produksi 0x06509A5D9496A3Bfc996495c53AAA57515ca569e).
///           release() boleh dipanggil siapa pun — dana hanya pernah
///           bergerak ke penerima.
///         - OPUS presale yang tidak terjual KEMBALI ke kontrak ini
///           (transfer biasa dari OpusPresale, SPEC 5A): akuntansi
///           berbasis saldo (total = saldo kini + yang sudah terlepas),
///           sehingga OPUS yang kembali otomatis ikut jadwal yang sama.
///         - Alamat token di-bind satu kali oleh deployer (pola bind
///           fase 1) karena token dicetak setelah kontrak ini ada.
///         Kontrak IMMUTABLE: tanpa owner-withdraw / pause / upgrade.
contract TeamVesting {
    uint256 public constant CLIFF_SECONDS = 30 days;
    uint256 public constant VEST_SECONDS = 365 days;

    /// @notice Penerima vesting: wallet treasury (immutable).
    address public immutable beneficiary;
    /// @notice Kontrak sale — sumber status & jam graduation.
    ISaleForVesting public immutable sale;
    address public immutable deployer;
    IERC20Vest public opus;

    /// @notice Total OPUS yang sudah dilepas ke beneficiary.
    uint256 public released;

    event TokenBound(address indexed token);
    event Released(address indexed beneficiary, uint256 amount);

    constructor(address beneficiary_, address sale_) {
        require(beneficiary_ != address(0), "TeamVesting: beneficiary zero address");
        require(sale_ != address(0), "TeamVesting: sale zero address");
        beneficiary = beneficiary_;
        sale = ISaleForVesting(sale_);
        deployer = msg.sender;
    }

    /// @notice Bind alamat OpusToken — satu kali, hanya deployer.
    function bindToken(address token_) external {
        require(msg.sender == deployer, "TeamVesting: not the deployer");
        require(address(opus) == address(0), "TeamVesting: token already bound");
        require(token_ != address(0), "TeamVesting: token zero address");
        opus = IERC20Vest(token_);
        emit TokenBound(token_);
    }

    /// @notice Momen graduation (unix) — 0 bila sale belum lulus.
    function graduationTime() public view returns (uint256) {
        if (!sale.graduated()) return 0;
        return sale.VERDICT();
    }

    /// @notice Total alokasi yang mengikuti jadwal = saldo kini +
    ///         yang sudah terlepas (termasuk OPUS presale yang kembali).
    function totalAllocation() public view returns (uint256) {
        if (address(opus) == address(0)) return released;
        return opus.balanceOf(address(this)) + released;
    }

    /// @notice Bagian yang sudah vesting (termasuk yang sudah terlepas)
    ///         pada waktu `t` menurut jadwal cliff + linear.
    function vestedAt(uint256 t) public view returns (uint256) {
        uint256 g = graduationTime();
        if (g == 0) return 0;
        uint256 cliffEnd = g + CLIFF_SECONDS;
        if (t <= cliffEnd) return 0;
        uint256 total = totalAllocation();
        if (t >= cliffEnd + VEST_SECONDS) return total;
        return (total * (t - cliffEnd)) / VEST_SECONDS;
    }

    /// @notice Yang bisa dilepas saat ini.
    function releasable() public view returns (uint256) {
        uint256 v = vestedAt(block.timestamp);
        return v > released ? v - released : 0;
    }

    /// @notice Lepas OPUS yang sudah vesting ke wallet treasury.
    ///         Boleh dipanggil siapa pun; tujuan selalu beneficiary.
    function release() external {
        require(address(opus) != address(0), "TeamVesting: token not bound");
        uint256 amount = releasable();
        require(amount > 0, "TeamVesting: nothing to release");
        released += amount;
        require(opus.transfer(beneficiary, amount), "TeamVesting: transfer failed");
        emit Released(beneficiary, amount);
    }
}
