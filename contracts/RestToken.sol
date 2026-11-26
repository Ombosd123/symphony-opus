// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title RestToken — token tanda terima presale REST, SYMPHONY (SPEC 26)
/// @notice REST adalah TANDA TERIMA pembelian OpusPresale, diterbitkan
///         ke dompet pembeli PADA SAAT pembelian — token pertama yang
///         benar-benar dipegang pembeli presale, yang sebelumnya hanya
///         memegang catatan kontribusi di dalam kontrak:
///         - 1 REST = 1 OPUS hak presale pembeli (kontribusi x 10.000):
///           beli 50 USDT -> 500.000 REST seketika di dompet.
///         - NON-TRANSFERABLE (soulbound): tidak bisa dikirim, dijual,
///           atau dihadiahkan ke dompet lain. Tanda terima dan haknya
///           tidak pernah berpisah — tidak ada pasar bayangan OPUS
///           sebelum vonis, dan klaim tidak bisa berpindah tangan.
///         - Saat sale LULUS dan pool dibuka, OpusPresale membagikan
///           OPUS secara OTOMATIS (distribute) sesuai saldo REST dan
///           membakar REST dalam gerakan yang sama — pembeli tidak
///           perlu melakukan apa pun setelah membeli.
///         - Saat sale GAGAL, REST hangus pada saat refund USDT
///           diklaim; REST tidak pernah tertukar ke USDT.
///         - TANPA pool, TANPA harga, TANPA pajak, TANPA fungsi apa
///           pun di luar tanda terima. mint & burn HANYA oleh kontrak
///           presale yang terikat satu-kali (bindPresale oleh
///           deployer); tidak ada jalur lain, tidak ada owner, tidak
///           ada pause. IMMUTABLE.
contract RestToken {
    string public constant name = "Rest";
    string public constant symbol = "REST";
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);
    event PresaleBound(address indexed presale);

    address public immutable deployer;
    /// @notice Satu-satunya alamat yang boleh mencetak & membakar
    ///         (kontrak OpusPresale).
    address public presale;

    constructor() {
        deployer = msg.sender;
    }

    /// @notice Ikat kontrak presale sebagai pencetak/pembakar tunggal.
    ///         Satu-kali, hanya oleh deployer.
    function bindPresale(address presale_) external {
        require(msg.sender == deployer, "RestToken: not the deployer");
        require(presale == address(0), "RestToken: presale already bound");
        require(presale_ != address(0), "RestToken: presale zero address");
        presale = presale_;
        emit PresaleBound(presale_);
    }

    /// @notice Cetak REST untuk seorang pembeli presale. Hanya boleh
    ///         dipanggil oleh kontrak presale yang terikat.
    function mint(address to, uint256 amount) external {
        require(msg.sender == presale, "RestToken: only the presale mints");
        require(to != address(0), "RestToken: mint to zero address");
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    /// @notice Bakar REST milik seorang pembeli (saat OPUS dibagikan
    ///         atau refund diklaim). Hanya kontrak presale terikat.
    function burnFrom(address account, uint256 amount) external {
        require(msg.sender == presale, "RestToken: only the presale burns");
        require(balanceOf[account] >= amount, "RestToken: burn exceeds balance");
        balanceOf[account] -= amount;
        totalSupply -= amount;
        emit Transfer(account, address(0), amount);
    }

    /// @notice REST adalah tanda terima soulbound — transfer selalu
    ///         ditolak. approve/allowance dipertahankan hanya demi
    ///         kompatibilitas antarmuka ERC-20; tidak ada transfer
    ///         yang bisa menggunakannya.
    function transfer(address, uint256) external pure returns (bool) {
        revert("RestToken: non-transferable");
    }

    function transferFrom(address, address, uint256) external pure returns (bool) {
        revert("RestToken: non-transferable");
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }
}
