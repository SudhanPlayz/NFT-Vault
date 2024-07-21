# Comprehensive NFT Vault Program Function Explanations

## 1. initialize_vault

```rust
pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()>
```

**Context (`InitializeVault`):**
```rust
#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(init, payer = authority, space = 8 + 32 + 4 + 8 + 1000)]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}
```

- `vault`: A new account to be initialized as the Vault. It's paying for its own initialization.
- `authority`: The signer who will have authority over the vault. This account is marked as mutable because it will pay for the vault initialization.
- `system_program`: Required for creating new accounts on Solana.

**Function Details:**
- Initializes a new `Vault` account with the following fields:
  - `authority`: Set to the public key of the signer.
  - `nft_count`: Initialized to 0.
  - `total_rent`: Initialized to 0.
- The `space` in the account initialization (8 + 32 + 4 + 8 + 1000) allocates enough space for the account discriminator (8 bytes), authority public key (32 bytes), nft_count (4 bytes), total_rent (8 bytes), and extra space for the `locked_nfts` vector (1000 bytes).

## 2. mint_nft

```rust
pub fn mint_nft(
    ctx: Context<MintNFT>,
    name: String,
    symbol: String,
    uri: String,
) -> Result<()>
```

**Context (`MintNFT`):**
```rust
#[derive(Accounts)]
pub struct MintNFT<'info> {
    #[account(init, payer = payer, space = 8 + 32 + 32 + 200)]
    pub nft_data: Account<'info, NFTData>,
    #[account(
        init,
        payer = payer,
        mint::decimals = 0,
        mint::authority = payer,
        mint::freeze_authority = payer,
    )]
    pub mint: Account<'info, Mint>,
    #[account(
        init,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = payer,
    )]
    pub token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}
```

**Parameters:**
- `name`: String - The name of the NFT.
- `symbol`: String - The symbol or ticker of the NFT.
- `uri`: String - The URI pointing to the NFT's metadata.

**Function Details:**
- Creates a new `Mint` account for the NFT with 0 decimals (making it non-fungible).
- Creates an Associated Token Account for the payer to hold the NFT.
- Mints exactly 1 token to the payer's token account.
- Initializes an `NFTData` account to store metadata about the NFT.
- The `payer` account pays for all the account creations and is set as the mint authority and freeze authority.

## 3. lock_nft

```rust
pub fn lock_nft(ctx: Context<LockNFT>) -> Result<()>
```

**Context (`LockNFT`):**
```rust
#[derive(Accounts)]
pub struct LockNFT<'info> {
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub nft_mint: Account<'info, Mint>,
    #[account(mut)]
    pub user_nft_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault_nft_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
```

**Function Details:**
- Increases the `nft_count` in the vault.
- Adds a new `LockedNFT` entry to the `locked_nfts` vector in the vault, storing the NFT's mint address and the current timestamp.
- Transfers 1 token (the NFT) from the user's token account to the vault's token account.
- The `user` must be the signer and owner of the NFT being locked.

## 4. unlock_nft

```rust
pub fn unlock_nft(ctx: Context<UnlockNFT>) -> Result<()>
```

**Context (`UnlockNFT`):**
```rust
#[derive(Accounts)]
pub struct UnlockNFT<'info> {
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub nft_mint: Account<'info, Mint>,
    #[account(mut)]
    pub user_nft_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault_nft_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
```

**Function Details:**
- Finds the `LockedNFT` entry in the vault's `locked_nfts` vector that matches the provided NFT mint.
- Calculates the rent based on the lock duration (current time - lock time).
- Removes the `LockedNFT` entry from the vault.
- Decreases the `nft_count` and increases the `total_rent` in the vault.
- Transfers the NFT from the vault's token account back to the user's token account.
- If the NFT is not found in the vault, it returns an `NFTNotFound` error.

## 5. claim_rent

```rust
pub fn claim_rent(ctx: Context<ClaimRent>) -> Result<()>
```

**Context (`ClaimRent`):**
```rust
#[derive(Accounts)]
pub struct ClaimRent<'info> {
    #[account(mut, has_one = authority)]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}
```

**Function Details:**
- Retrieves the total rent accumulated in the vault.
- Transfers this amount from the vault to the authority.
- Resets the `total_rent` in the vault to 0.
- Only the vault's authority can call this function (enforced by the `has_one = authority` constraint).

## 6. swap_sol_for_nft

```rust
pub fn swap_sol_for_nft(ctx: Context<SwapSolForNFT>, amount: u64) -> Result<()>
```

**Context (`SwapSolForNFT`):**
```rust
#[derive(Accounts)]
pub struct SwapSolForNFT<'info> {
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub nft_mint: Account<'info, Mint>,
    #[account(mut)]
    pub user_nft_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault_nft_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
```

**Parameters:**
- `amount`: u64 - The amount of SOL to pay for the NFT (in lamports).

**Function Details:**
- Checks if there are any NFTs available in the vault (`nft_count > 0`).
- Transfers the specified amount of SOL from the user to the vault.
- Transfers one NFT from the vault's token account to the user's token account.
- Decreases the `nft_count` in the vault.
- If no NFTs are available, it returns a `NoNFTsAvailable` error.

## Helper Function: calculate_rent

```rust
fn calculate_rent(lock_duration: i64) -> u64
```

**Parameters:**
- `lock_duration`: i64 - The duration (in seconds) that the NFT was locked.

**Function Details:**
- Calculates the rent based on a rate of 1 SOL per day.
- Converts the lock duration from seconds to days and multiplies by 1 SOL (1_000_000_000 lamports).
- Returns the calculated rent in lamports.

This function is used internally by the `unlock_nft` function to determine how much rent should be paid for the locked NFT.