# NFT Vault and Swap Program

This project implements an NFT minting, vaulting, and swapping system on the Solana blockchain using the Anchor framework. The program allows users to mint NFTs, lock them in a vault, and swap SOL for NFTs.

## Features

- Mint a collection of NFTs
- Lock NFTs in a vault with a rental system
- Claim rent from locked NFTs (returned to the protocol)
- Swap SOL for NFTs

## Getting Started

### Prerequisites

- Node.js v18.18.0 or higher
- Rust v1.77.2 or higher
- Anchor CLI 0.30.0 or higher
- Solana CLI 1.18.9 or higher

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/SudhanPlayz/NFT-Vault.git
   cd NFT-Vault
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Build the Anchor program:
   ```
   anchor build
   ```

## Usage

### Deploying the Program

1. Start a local Solana test validator:
   ```
   solana-test-validator
   ```

2. Deploy the program:
   ```
   anchor deploy
   ```

### Running Tests

Execute the test suite:

```
anchor test
```

## Program Structure

The program consists of several instructions:

1. `initialize_vault`: Set up the vault to store NFTs
2. `mint_nft`: Create a new NFT
3. `lock_nft`: Lock an NFT in the vault
4. `unlock_nft`: Retrieve an NFT from the vault
5. `claim_rent`: Claim accumulated rent from locked NFTs
6. `swap_sol_for_nft`: Exchange SOL for an NFT from the vault

## Account Structures

- `Vault`: Stores information about locked NFTs and accumulated rent
- `NFTData`: Contains metadata for minted NFTs

## Error Handling

The program defines custom error codes:

- `NFTNotFound`: Thrown when trying to unlock an NFT that's not in the vault
- `NoNFTsAvailable`: Thrown when trying to swap SOL for an NFT when the vault is empty

## Development

To modify the program:

1. Edit the Rust code in `programs/nft-vault/src/lib.rs`
2. Update tests in `tests/nft-vault.ts` as needed
3. Run `anchor build` to compile changes
4. Run `anchor test` to ensure everything works correctly