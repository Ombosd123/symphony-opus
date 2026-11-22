// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title OpusToken — token OPUS ($OPUS) SYMPHONY
/// @notice SPEC-SYMPHONY.md bagian 6 & 10 (fase 2):
///         - ERC-20 POLOS: tanpa pajak transfer (opsi pajak DITOLAK
///           2026-11-22), tanpa fungsi owner, tanpa pause,
///           tanpa mint ulang — 600 jt dicetak SEKALI di konstruktor ke
///           alamat-alamat alokasi:
///             SymphonySale   530 jt = peserta 325 jt + pool 175 jt
///                            + referral sale 25 jt + kolam Encore 5 jt
///             Distributor    50 jt = komunitas (Soundcheck 30 jt +
///                            bonus Prelude rata 15 jt + referral
///                            Prelude fase 1 5 jt)
///             TeamVesting    15 jt (jatah tim yang di-vesting)
///             OpusPresale    5 jt (jatah tim yang dijual presale, 5A)
///           Total tepat 600 jt; konstruktor revert bila ada alamat nol.
///         - burn(amount): setiap pemegang bisa membakar saldonya
///           sendiri (pasokan berkurang). Dipakai kontrak-kontrak sistem
///           untuk membakar jatah yang hangus menurut SPEC (sisa
///           referral sale, sisa kolam Encore, sisa distributor).
///         Kontrak IMMUTABLE: tidak ada peran istimewa setelah deploy.
contract OpusToken {
    string public constant name = "OPUS";
    string public constant symbol = "OPUS";
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);
    event Burned(address indexed from, uint256 amount);

    /// @notice Alokasi tetap (SPEC 6) dalam satuan token penuh (18 desimal).
    uint256 public constant ALLOC_SALE = 530_000_000 ether;
    uint256 public constant ALLOC_DISTRIBUTOR = 50_000_000 ether;
    uint256 public constant ALLOC_VESTING = 15_000_000 ether;
    uint256 public constant ALLOC_PRESALE = 5_000_000 ether;
    uint256 public constant TOTAL_ALLOC = 600_000_000 ether;

    constructor(address sale_, address distributor_, address vesting_, address presale_) {
        require(sale_ != address(0), "OpusToken: sale zero address");
        require(distributor_ != address(0), "OpusToken: distributor zero address");
        require(vesting_ != address(0), "OpusToken: vesting zero address");
        require(presale_ != address(0), "OpusToken: presale zero address");
        _mint(sale_, ALLOC_SALE);
        _mint(distributor_, ALLOC_DISTRIBUTOR);
        _mint(vesting_, ALLOC_VESTING);
        _mint(presale_, ALLOC_PRESALE);
    }

    function _mint(address to, uint256 amount) internal {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    /// @notice Bakar token dari saldo pemanggil sendiri; pasokan total
    ///         berkurang. Satu-satunya jalur pengurangan pasokan.
    function burn(uint256 amount) external {
        require(balanceOf[msg.sender] >= amount, "OpusToken: insufficient balance");
        balanceOf[msg.sender] -= amount;
        totalSupply -= amount;
        emit Transfer(msg.sender, address(0), amount);
        emit Burned(msg.sender, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "OpusToken: allowance too low");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "OpusToken: transfer to zero address");
        require(balanceOf[from] >= amount, "OpusToken: insufficient balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
