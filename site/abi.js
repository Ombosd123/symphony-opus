// abi.js — generated from artifacts/*.json by the phase-1 build (do not edit by hand).
window.SYMPHONY_ABI = {
 "PreludeRegistry": [
  {
   "inputs": [
    {
     "internalType": "address",
     "name": "registry_",
     "type": "address"
    },
    {
     "internalType": "uint256",
     "name": "registrationEnd_",
     "type": "uint256"
    }
   ],
   "stateMutability": "nonpayable",
   "type": "constructor"
  },
  {
   "anonymous": false,
   "inputs": [
    {
     "indexed": true,
     "internalType": "address",
     "name": "user",
     "type": "address"
    },
    {
     "indexed": false,
     "internalType": "uint256",
     "name": "tokenId",
     "type": "uint256"
    }
   ],
   "name": "PassBurned",
   "type": "event"
  },
  {
   "anonymous": false,
   "inputs": [
    {
     "indexed": true,
     "internalType": "address",
     "name": "user",
     "type": "address"
    },
    {
     "indexed": false,
     "internalType": "uint256",
     "name": "tokenId",
     "type": "uint256"
    },
    {
     "indexed": false,
     "internalType": "uint256",
     "name": "count",
     "type": "uint256"
    },
    {
     "indexed": false,
     "internalType": "address",
     "name": "referrer",
     "type": "address"
    }
   ],
   "name": "Registered",
   "type": "event"
  },
  {
   "anonymous": false,
   "inputs": [
    {
     "indexed": true,
     "internalType": "address",
     "name": "from",
     "type": "address"
    },
    {
     "indexed": true,
     "internalType": "address",
     "name": "to",
     "type": "address"
    },
    {
     "indexed": true,
     "internalType": "uint256",
     "name": "tokenId",
     "type": "uint256"
    }
   ],
   "name": "Transfer",
   "type": "event"
  },
  {
   "inputs": [],
   "name": "MIN_REGISTRANTS",
   "outputs": [
    {
     "internalType": "uint256",
     "name": "",
     "type": "uint256"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [],
   "name": "PASS_METADATA_URI",
   "outputs": [
    {
     "internalType": "string",
     "name": "",
     "type": "string"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "address",
     "name": "",
     "type": "address"
    },
    {
     "internalType": "uint256",
     "name": "",
     "type": "uint256"
    }
   ],
   "name": "approve",
   "outputs": [],
   "stateMutability": "pure",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "address",
     "name": "owner",
     "type": "address"
    }
   ],
   "name": "balanceOf",
   "outputs": [
    {
     "internalType": "uint256",
     "name": "",
     "type": "uint256"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "uint256",
     "name": "tokenId",
     "type": "uint256"
    }
   ],
   "name": "burn",
   "outputs": [],
   "stateMutability": "nonpayable",
   "type": "function"
  },
  {
   "inputs": [],
   "name": "count",
   "outputs": [
    {
     "internalType": "uint256",
     "name": "",
     "type": "uint256"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "uint256",
     "name": "tokenId",
     "type": "uint256"
    }
   ],
   "name": "getApproved",
   "outputs": [
    {
     "internalType": "address",
     "name": "",
     "type": "address"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "address",
     "name": "user",
     "type": "address"
    }
   ],
   "name": "hasPass",
   "outputs": [
    {
     "internalType": "bool",
     "name": "",
     "type": "bool"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "address",
     "name": "user",
     "type": "address"
    }
   ],
   "name": "holdsPass",
   "outputs": [
    {
     "internalType": "bool",
     "name": "",
     "type": "bool"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "address",
     "name": "",
     "type": "address"
    },
    {
     "internalType": "address",
     "name": "",
     "type": "address"
    }
   ],
   "name": "isApprovedForAll",
   "outputs": [
    {
     "internalType": "bool",
     "name": "",
     "type": "bool"
    }
   ],
   "stateMutability": "pure",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "address",
     "name": "user",
     "type": "address"
    }
   ],
   "name": "isRegistered",
   "outputs": [
    {
     "internalType": "bool",
     "name": "",
     "type": "bool"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [],
   "name": "name",
   "outputs": [
    {
     "internalType": "string",
     "name": "",
     "type": "string"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "uint256",
     "name": "tokenId",
     "type": "uint256"
    }
   ],
   "name": "ownerOf",
   "outputs": [
    {
     "internalType": "address",
     "name": "",
     "type": "address"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "address",
     "name": "",
     "type": "address"
    }
   ],
   "name": "passOf",
   "outputs": [
    {
     "internalType": "uint256",
     "name": "",
     "type": "uint256"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "address",
     "name": "",
     "type": "address"
    }
   ],
   "name": "referralCount",
   "outputs": [
    {
     "internalType": "uint256",
     "name": "",
     "type": "uint256"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "address",
     "name": "",
     "type": "address"
    }
   ],
   "name": "referrerOf",
   "outputs": [
    {
     "internalType": "address",
     "name": "",
     "type": "address"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [],
   "name": "register",
   "outputs": [],
   "stateMutability": "nonpayable",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "address",
     "name": "referrer",
     "type": "address"
    }
   ],
   "name": "registerRef",
   "outputs": [],
   "stateMutability": "nonpayable",
   "type": "function"
  },
  {
   "inputs": [],
   "name": "registrationEnd",
   "outputs": [
    {
     "internalType": "uint256",
     "name": "",
     "type": "uint256"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [],
   "name": "registry",
   "outputs": [
    {
     "internalType": "contract IAgentIdRegistry",
     "name": "",
     "type": "address"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "address",
     "name": "",
     "type": "address"
    },
    {
     "internalType": "address",
     "name": "",
     "type": "address"
    },
    {
     "internalType": "uint256",
     "name": "",
     "type": "uint256"
    }
   ],
   "name": "safeTransferFrom",
   "outputs": [],
   "stateMutability": "pure",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "address",
     "name": "",
     "type": "address"
    },
    {
     "internalType": "address",
     "name": "",
     "type": "address"
    },
    {
     "internalType": "uint256",
     "name": "",
     "type": "uint256"
    },
    {
     "internalType": "bytes",
     "name": "",
     "type": "bytes"
    }
   ],
   "name": "safeTransferFrom",
   "outputs": [],
   "stateMutability": "pure",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "address",
     "name": "",
     "type": "address"
    },
    {
     "internalType": "bool",
     "name": "",
     "type": "bool"
    }
   ],
   "name": "setApprovalForAll",
   "outputs": [],
   "stateMutability": "pure",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "bytes4",
     "name": "interfaceId",
     "type": "bytes4"
    }
   ],
   "name": "supportsInterface",
   "outputs": [
    {
     "internalType": "bool",
     "name": "",
     "type": "bool"
    }
   ],
   "stateMutability": "pure",
   "type": "function"
  },
  {
   "inputs": [],
   "name": "symbol",
   "outputs": [
    {
     "internalType": "string",
     "name": "",
     "type": "string"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "uint256",
     "name": "tokenId",
     "type": "uint256"
    }
   ],
   "name": "tokenURI",
   "outputs": [
    {
     "internalType": "string",
     "name": "",
     "type": "string"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [],
   "name": "totalRegistered",
   "outputs": [
    {
     "internalType": "uint256",
     "name": "",
     "type": "uint256"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "address",
     "name": "",
     "type": "address"
    },
    {
     "internalType": "address",
     "name": "",
     "type": "address"
    },
    {
     "internalType": "uint256",
     "name": "",
     "type": "uint256"
    }
   ],
   "name": "transferFrom",
   "outputs": [],
   "stateMutability": "pure",
   "type": "function"
  }
 ],
 "Soundcheck": [
  {
   "inputs": [
    {
     "internalType": "address",
     "name": "registry_",
     "type": "address"
    },
    {
     "internalType": "address",
     "name": "usdt_",
     "type": "address"
    },
    {
     "internalType": "address",
     "name": "treasuryVault_",
     "type": "address"
    },
    {
     "internalType": "uint256",
     "name": "seasonEnd_",
     "type": "uint256"
    }
   ],
   "stateMutability": "nonpayable",
   "type": "constructor"
  },
  {
   "anonymous": false,
   "inputs": [
    {
     "indexed": true,
     "internalType": "address",
     "name": "user",
     "type": "address"
    },
    {
     "indexed": true,
     "internalType": "uint8",
     "name": "badgeType",
     "type": "uint8"
    },
    {
     "indexed": false,
     "internalType": "uint256",
     "name": "tokenId",
     "type": "uint256"
    }
   ],
   "name": "BadgeMinted",
   "type": "event"
  },
  {
   "anonymous": false,
   "inputs": [
    {
     "indexed": true,
     "internalType": "address",
     "name": "user",
     "type": "address"
    },
    {
     "indexed": false,
     "internalType": "uint256",
     "name": "streak",
     "type": "uint256"
    },
    {
     "indexed": false,
     "internalType": "uint256",
     "name": "day",
     "type": "uint256"
    }
   ],
   "name": "CheckedIn",
   "type": "event"
  },
  {
   "anonymous": false,
   "inputs": [
    {
     "indexed": false,
     "internalType": "uint256",
     "name": "refundDeadline",
     "type": "uint256"
    }
   ],
   "name": "Failed",
   "type": "event"
  },
  {
   "anonymous": false,
   "inputs": [
    {
     "indexed": true,
     "internalType": "address",
     "name": "poolRecipient",
     "type": "address"
    },
    {
     "indexed": false,
     "internalType": "uint256",
     "name": "poolShareSwept",
     "type": "uint256"
    }
   ],
   "name": "Graduated",
   "type": "event"
  },
  {
   "anonymous": false,
   "inputs": [
    {
     "indexed": true,
     "internalType": "address",
     "name": "user",
     "type": "address"
    },
    {
     "indexed": false,
     "internalType": "uint256",
     "name": "tokenId",
     "type": "uint256"
    }
   ],
   "name": "MagnumBurned",
   "type": "event"
  },
  {
   "anonymous": false,
   "inputs": [
    {
     "indexed": true,
     "internalType": "address",
     "name": "market",
     "type": "address"
    }
   ],
   "name": "MarketBound",
   "type": "event"
  },
  {
   "anonymous": false,
   "inputs": [
    {
     "indexed": true,
     "internalType": "address",
     "name": "user",
     "type": "address"
    },
    {
     "indexed": false,
     "internalType": "uint256",
     "name": "amount",
     "type": "uint256"
    }
   ],
   "name": "PoolShareRefunded",
   "type": "event"
  },
  {
   "anonymous": false,
   "inputs": [
    {
     "indexed": true,
     "internalType": "address",
     "name": "sale",
     "type": "address"
    }
   ],
   "name": "SaleBound",
   "type": "event"
  },
  {
   "anonymous": false,
   "inputs": [
    {
     "indexed": true,
     "internalType": "address",
     "name": "user",
     "type": "address"
    },
    {
     "indexed": false,
     "internalType": "uint256",
     "name": "streak",
     "type": "uint256"
    }
   ],
   "name": "StreakRepaired",
   "type": "event"
  },
  {
   "anonymous": false,
   "inputs": [
    {
     "indexed": true,
     "internalType": "address",
     "name": "from",
     "type": "address"
    },
    {
     "indexed": true,
     "internalType": "address",
     "name": "to",
     "type": "address"
    },
    {
     "indexed": true,
     "internalType": "uint256",
     "name": "tokenId",
     "type": "uint256"
    }
   ],
   "name": "Transfer",
   "type": "event"
  },
  {
   "inputs": [],
   "name": "BADGE_FIRST_NOTE",
   "outputs": [
    {
     "internalType": "uint8",
     "name": "",
     "type": "uint8"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [],
   "name": "BADGE_FULL_SCORE",
   "outputs": [
    {
     "internalType": "uint8",
     "name": "",
     "type": "uint8"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [],
   "name": "BADGE_MAGNUM",
   "outputs": [
    {
     "internalType": "uint8",
     "name": "",
     "type": "uint8"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [],
   "name": "BADGE_REHEARSAL",
   "outputs": [
    {
     "internalType": "uint8",
     "name": "",
     "type": "uint8"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [],
   "name": "BADGE_TUNING",
   "outputs": [
    {
     "internalType": "uint8",
     "name": "",
     "type": "uint8"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [],
   "name": "REPAIR_FEE",
   "outputs": [
    {
     "internalType": "uint256",
     "name": "",
     "type": "uint256"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [],
   "name": "REPAIR_POOL_SHARE",
   "outputs": [
    {
     "internalType": "uint256",
     "name": "",
     "type": "uint256"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [],
   "name": "REPAIR_TEAM_SHARE",
   "outputs": [
    {
     "internalType": "uint256",
     "name": "",
     "type": "uint256"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "address",
     "name": "spender",
     "type": "address"
    },
    {
     "internalType": "uint256",
     "name": "tokenId",
     "type": "uint256"
    }
   ],
   "name": "approve",
   "outputs": [],
   "stateMutability": "nonpayable",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "address",
     "name": "",
     "type": "address"
    },
    {
     "internalType": "uint8",
     "name": "",
     "type": "uint8"
    }
   ],
   "name": "badgeOf",
   "outputs": [
    {
     "internalType": "uint256",
     "name": "",
     "type": "uint256"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "uint256",
     "name": "",
     "type": "uint256"
    }
   ],
   "name": "badgeTypeOf",
   "outputs": [
    {
     "internalType": "uint8",
     "name": "",
     "type": "uint8"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "address",
     "name": "owner",
     "type": "address"
    }
   ],
   "name": "balanceOf",
   "outputs": [
    {
     "internalType": "uint256",
     "name": "n",
     "type": "uint256"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "address",
     "name": "market_",
     "type": "address"
    }
   ],
   "name": "bindMarket",
   "outputs": [],
   "stateMutability": "nonpayable",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "address",
     "name": "sale_",
     "type": "address"
    }
   ],
   "name": "bindSale",
   "outputs": [],
   "stateMutability": "nonpayable",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "uint256",
     "name": "tokenId",
     "type": "uint256"
    }
   ],
   "name": "burn",
   "outputs": [],
   "stateMutability": "nonpayable",
   "type": "function"
  },
  {
   "inputs": [],
   "name": "checkIn",
   "outputs": [],
   "stateMutability": "nonpayable",
   "type": "function"
  },
  {
   "inputs": [],
   "name": "claimPoolShareRefund",
   "outputs": [],
   "stateMutability": "nonpayable",
   "type": "function"
  },
  {
   "inputs": [],
   "name": "deployer",
   "outputs": [
    {
     "internalType": "address",
     "name": "",
     "type": "address"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "uint256",
     "name": "tokenId",
     "type": "uint256"
    }
   ],
   "name": "getApproved",
   "outputs": [
    {
     "internalType": "address",
     "name": "",
     "type": "address"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "address",
     "name": "user",
     "type": "address"
    }
   ],
   "name": "hasMagnum",
   "outputs": [
    {
     "internalType": "bool",
     "name": "",
     "type": "bool"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "address",
     "name": "",
     "type": "address"
    },
    {
     "internalType": "address",
     "name": "",
     "type": "address"
    }
   ],
   "name": "isApprovedForAll",
   "outputs": [
    {
     "internalType": "bool",
     "name": "",
     "type": "bool"
    }
   ],
   "stateMutability": "pure",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "address",
     "name": "",
     "type": "address"
    }
   ],
   "name": "lastCheckInDayOf",
   "outputs": [
    {
     "internalType": "uint256",
     "name": "",
     "type": "uint256"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "address",
     "name": "",
     "type": "address"
    }
   ],
   "name": "magnumMinted",
   "outputs": [
    {
     "internalType": "bool",
     "name": "",
     "type": "bool"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "uint256",
     "name": "refundDeadline_",
     "type": "uint256"
    }
   ],
   "name": "markFailed",
   "outputs": [],
   "stateMutability": "nonpayable",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "address",
     "name": "poolRecipient",
     "type": "address"
    }
   ],
   "name": "markGraduated",
   "outputs": [],
   "stateMutability": "nonpayable",
   "type": "function"
  },
  {
   "inputs": [],
   "name": "market",
   "outputs": [
    {
     "internalType": "address",
     "name": "",
     "type": "address"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [],
   "name": "name",
   "outputs": [
    {
     "internalType": "string",
     "name": "",
     "type": "string"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [],
   "name": "outcome",
   "outputs": [
    {
     "internalType": "enum Soundcheck.Outcome",
     "name": "",
     "type": "uint8"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "uint256",
     "name": "tokenId",
     "type": "uint256"
    }
   ],
   "name": "ownerOf",
   "outputs": [
    {
     "internalType": "address",
     "name": "",
     "type": "address"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "address",
     "name": "",
     "type": "address"
    }
   ],
   "name": "poolSharePaid",
   "outputs": [
    {
     "internalType": "uint256",
     "name": "",
     "type": "uint256"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [],
   "name": "refundDeadline",
   "outputs": [
    {
     "internalType": "uint256",
     "name": "",
     "type": "uint256"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [],
   "name": "registry",
   "outputs": [
    {
     "internalType": "contract IAgentIdRegistrySC",
     "name": "",
     "type": "address"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [],
   "name": "repairStreak",
   "outputs": [],
   "stateMutability": "nonpayable",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "address",
     "name": "from",
     "type": "address"
    },
    {
     "internalType": "address",
     "name": "to",
     "type": "address"
    },
    {
     "internalType": "uint256",
     "name": "tokenId",
     "type": "uint256"
    }
   ],
   "name": "safeTransferFrom",
   "outputs": [],
   "stateMutability": "nonpayable",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "address",
     "name": "from",
     "type": "address"
    },
    {
     "internalType": "address",
     "name": "to",
     "type": "address"
    },
    {
     "internalType": "uint256",
     "name": "tokenId",
     "type": "uint256"
    },
    {
     "internalType": "bytes",
     "name": "",
     "type": "bytes"
    }
   ],
   "name": "safeTransferFrom",
   "outputs": [],
   "stateMutability": "nonpayable",
   "type": "function"
  },
  {
   "inputs": [],
   "name": "sale",
   "outputs": [
    {
     "internalType": "address",
     "name": "",
     "type": "address"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [],
   "name": "seasonEnd",
   "outputs": [
    {
     "internalType": "uint256",
     "name": "",
     "type": "uint256"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [],
   "name": "seasonEndedByGraduation",
   "outputs": [
    {
     "internalType": "bool",
     "name": "",
     "type": "bool"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "address",
     "name": "",
     "type": "address"
    },
    {
     "internalType": "bool",
     "name": "",
     "type": "bool"
    }
   ],
   "name": "setApprovalForAll",
   "outputs": [],
   "stateMutability": "pure",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "address",
     "name": "",
     "type": "address"
    }
   ],
   "name": "streakOf",
   "outputs": [
    {
     "internalType": "uint256",
     "name": "",
     "type": "uint256"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "bytes4",
     "name": "interfaceId",
     "type": "bytes4"
    }
   ],
   "name": "supportsInterface",
   "outputs": [
    {
     "internalType": "bool",
     "name": "",
     "type": "bool"
    }
   ],
   "stateMutability": "pure",
   "type": "function"
  },
  {
   "inputs": [],
   "name": "symbol",
   "outputs": [
    {
     "internalType": "string",
     "name": "",
     "type": "string"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "uint256",
     "name": "tokenId",
     "type": "uint256"
    }
   ],
   "name": "tokenURI",
   "outputs": [
    {
     "internalType": "string",
     "name": "",
     "type": "string"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "address",
     "name": "",
     "type": "address"
    }
   ],
   "name": "totalCheckInsOf",
   "outputs": [
    {
     "internalType": "uint256",
     "name": "",
     "type": "uint256"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [],
   "name": "totalPoolShare",
   "outputs": [
    {
     "internalType": "uint256",
     "name": "",
     "type": "uint256"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "address",
     "name": "from",
     "type": "address"
    },
    {
     "internalType": "address",
     "name": "to",
     "type": "address"
    },
    {
     "internalType": "uint256",
     "name": "tokenId",
     "type": "uint256"
    }
   ],
   "name": "transferFrom",
   "outputs": [],
   "stateMutability": "nonpayable",
   "type": "function"
  },
  {
   "inputs": [],
   "name": "treasuryVault",
   "outputs": [
    {
     "internalType": "address",
     "name": "",
     "type": "address"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [],
   "name": "usdt",
   "outputs": [
    {
     "internalType": "contract IERC20SC",
     "name": "",
     "type": "address"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  }
 ],
 "TreasuryVault": [
  {
   "inputs": [
    {
     "internalType": "address",
     "name": "claimer_",
     "type": "address"
    }
   ],
   "stateMutability": "nonpayable",
   "type": "constructor"
  },
  {
   "anonymous": false,
   "inputs": [
    {
     "indexed": true,
     "internalType": "address",
     "name": "token",
     "type": "address"
    },
    {
     "indexed": false,
     "internalType": "uint256",
     "name": "amount",
     "type": "uint256"
    }
   ],
   "name": "Claimed",
   "type": "event"
  },
  {
   "anonymous": false,
   "inputs": [
    {
     "indexed": false,
     "internalType": "uint256",
     "name": "amount",
     "type": "uint256"
    }
   ],
   "name": "ClaimedNative",
   "type": "event"
  },
  {
   "anonymous": false,
   "inputs": [
    {
     "indexed": true,
     "internalType": "address",
     "name": "from",
     "type": "address"
    },
    {
     "indexed": false,
     "internalType": "uint256",
     "name": "amount",
     "type": "uint256"
    }
   ],
   "name": "Received",
   "type": "event"
  },
  {
   "inputs": [
    {
     "internalType": "address",
     "name": "token",
     "type": "address"
    }
   ],
   "name": "balanceOf",
   "outputs": [
    {
     "internalType": "uint256",
     "name": "",
     "type": "uint256"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "address",
     "name": "token",
     "type": "address"
    },
    {
     "internalType": "uint256",
     "name": "amount",
     "type": "uint256"
    }
   ],
   "name": "claim",
   "outputs": [],
   "stateMutability": "nonpayable",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "address",
     "name": "token",
     "type": "address"
    }
   ],
   "name": "claimAll",
   "outputs": [],
   "stateMutability": "nonpayable",
   "type": "function"
  },
  {
   "inputs": [
    {
     "internalType": "uint256",
     "name": "amount",
     "type": "uint256"
    }
   ],
   "name": "claimNative",
   "outputs": [],
   "stateMutability": "nonpayable",
   "type": "function"
  },
  {
   "inputs": [],
   "name": "claimer",
   "outputs": [
    {
     "internalType": "address",
     "name": "",
     "type": "address"
    }
   ],
   "stateMutability": "view",
   "type": "function"
  },
  {
   "stateMutability": "payable",
   "type": "receive"
  }
 ]
};
