// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title VersToken — token pendamping VERS, SYMPHONY (SPEC 25)
/// @notice Token pendamping TANPA NILAI yang diterbitkan kontrak sale
///         kepada PEMBELI Pass pada saat pembelian primer:
///         10 VERS per 1 USDT yang dibayar (per Pass: T1 10, T2 15,
///         T3 20; pembelian yang melintasi batas tier dihitung dari
///         total yang dibayar, jadi selalu proporsional).
///         - TANPA pool, TANPA harga resmi, TANPA pajak transfer:
///           ERC-20 polos yang bebas ditransfer antar dompet.
///         - Satu-satunya fungsi yang dijanjikan bersifat kondisional:
///           BILA Scherzo (Season 2 — direncanakan) dibuka, VERS
///           terkonversi 1:1 menjadi VERT di sana, sebagai tambahan
///           di luar aturan perolehan VERT Scherzo sendiri. Bila
///           Rhapsody No. 1 gagal, VERS tetap di tangan pembeli
///           sebagai suvenir tanpa fungsi — tidak ditarik kembali.
///         - Penerbitan maksimum 70.000 VERS, hanya tercapai bila
///           seluruh 5.000 Pass habis terjual (7.000 USDT x 10).
///         - mint HANYA oleh kontrak sale yang terikat satu-kali
///           (bindSale oleh deployer); tidak ada jalur mint lain,
///           tidak ada owner, tidak ada pause. IMMUTABLE.
contract VersToken {
    string public constant name = "Vers";
    string public constant symbol = "VERS";
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);
    event SaleBound(address indexed sale);

    address public immutable deployer;
    /// @notice Satu-satunya alamat yang boleh mencetak (kontrak sale).
    address public sale;

    constructor() {
        deployer = msg.sender;
    }

    /// @notice Ikat kontrak sale sebagai pencetak tunggal. Satu-kali,
    ///         hanya oleh deployer.
    function bindSale(address sale_) external {
        require(msg.sender == deployer, "VersToken: not the deployer");
        require(sale == address(0), "VersToken: sale already bound");
        require(sale_ != address(0), "VersToken: sale zero address");
        sale = sale_;
        emit SaleBound(sale_);
    }

    /// @notice Cetak VERS untuk seorang pembeli Pass. Hanya boleh
    ///         dipanggil oleh kontrak sale yang terikat.
    function mint(address to, uint256 amount) external {
        require(msg.sender == sale, "VersToken: only the sale mints");
        require(to != address(0), "VersToken: mint to zero address");
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "VersToken: allowance too low");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "VersToken: transfer to zero address");
        require(balanceOf[from] >= amount, "VersToken: balance too low");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
