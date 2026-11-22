// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Interface ERC-20 minimal untuk claim token dari vault.
interface IERC20Claim {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title TreasuryVault — tampungan semua komisi treasury SYMPHONY
/// @notice SPEC-SYMPHONY.md bagian 1 & 10 (fase 1):
///         - Semua komisi treasury (bagian tim perbaikan streak 0,05 USDT,
///           potongan sale 10%, fee market 5%) masuk ke kontrak ini dulu,
///           BUKAN langsung ke wallet mana pun.
///         - claim() HANYA bisa dipanggil oleh wallet treasury yang
///           alamatnya IMMUTABLE di konstruktor. Produksi:
///           0x06509A5D9496A3Bfc996495c53AAA57515ca569e.
///         - claim bisa sebagian atau seluruhnya, kapan pun, berkali-kali.
///         - Vault menerima token ERC-20 apa pun dari siapa pun (transfer
///           biasa ke alamat kontrak) dan BNB via receive().
///         - TIDAK ada fungsi admin lain: tanpa owner, tanpa pause,
///           tanpa upgrade, tanpa setter apa pun. Satu-satunya hak
///           istimewa di seluruh kontrak adalah claim oleh claimer.
contract TreasuryVault {
    /// @notice Satu-satunya alamat yang boleh claim() — immutable.
    address public immutable claimer;

    event Claimed(address indexed token, uint256 amount);
    event ClaimedNative(uint256 amount);
    event Received(address indexed from, uint256 amount);

    constructor(address claimer_) {
        require(claimer_ != address(0), "TreasuryVault: claimer zero address");
        claimer = claimer_;
    }

    /// @notice Menerima BNB (gas sisa / pengiriman tak sengaja tetap bisa
    ///         diselamatkan claimer lewat claimNative).
    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    /// @notice Ambil `amount` token ERC-20 `token` ke wallet claimer.
    ///         Hanya claimer. amount = seluruh saldo juga sah.
    function claim(address token, uint256 amount) external {
        require(msg.sender == claimer, "TreasuryVault: not the claimer");
        require(token != address(0), "TreasuryVault: token zero address");
        require(amount > 0, "TreasuryVault: zero amount");
        require(
            IERC20Claim(token).balanceOf(address(this)) >= amount,
            "TreasuryVault: insufficient balance"
        );
        require(IERC20Claim(token).transfer(claimer, amount), "TreasuryVault: transfer failed");
        emit Claimed(token, amount);
    }

    /// @notice Ambil seluruh saldo token ERC-20 `token`. Hanya claimer.
    function claimAll(address token) external {
        require(msg.sender == claimer, "TreasuryVault: not the claimer");
        require(token != address(0), "TreasuryVault: token zero address");
        uint256 bal = IERC20Claim(token).balanceOf(address(this));
        require(bal > 0, "TreasuryVault: empty");
        require(IERC20Claim(token).transfer(claimer, bal), "TreasuryVault: transfer failed");
        emit Claimed(token, bal);
    }

    /// @notice Ambil BNB yang terlanjur masuk ke vault. Hanya claimer.
    function claimNative(uint256 amount) external {
        require(msg.sender == claimer, "TreasuryVault: not the claimer");
        require(amount > 0 && amount <= address(this).balance, "TreasuryVault: bad amount");
        (bool ok, ) = claimer.call{value: amount}("");
        require(ok, "TreasuryVault: native transfer failed");
        emit ClaimedNative(amount);
    }

    /// @notice Saldo token ERC-20 yang ditampung vault (kenyamanan baca).
    function balanceOf(address token) external view returns (uint256) {
        return IERC20Claim(token).balanceOf(address(this));
    }
}
