use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount};

declare_id!("cEQiCRrQzkEVHTPrTtNy6sPTkJRWF5KLdUeritG2xB6");

#[program]
pub mod nft_vault {
    use super::*;

    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.authority = ctx.accounts.authority.key();
        vault.nft_count = 0;
        vault.total_rent = 0;
        Ok(())
    }

    pub fn mint_nft(
        ctx: Context<MintNFT>,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        let cpi_accounts = token::MintTo {
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.token_account.to_account_info(),
            authority: ctx.accounts.payer.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::mint_to(cpi_ctx, 1)?;

        let nft_data = &mut ctx.accounts.nft_data;
        nft_data.name = name;
        nft_data.symbol = symbol;
        nft_data.uri = uri;
        nft_data.mint = ctx.accounts.mint.key();
        nft_data.owner = ctx.accounts.payer.key();

        Ok(())
    }

    pub fn lock_nft(ctx: Context<LockNFT>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        let clock = Clock::get()?;

        vault.nft_count += 1;
        vault.locked_nfts.push(LockedNFT {
            mint: ctx.accounts.nft_mint.key(),
            lock_time: clock.unix_timestamp,
        });

        let cpi_accounts = token::Transfer {
            from: ctx.accounts.user_nft_account.to_account_info(),
            to: ctx.accounts.vault_nft_account.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, 1)?;

        Ok(())
    }

    pub fn unlock_nft(ctx: Context<UnlockNFT>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        let clock = Clock::get()?;

        let nft_mint_key = ctx.accounts.nft_mint.key();
        let nft_position = vault
            .locked_nfts
            .iter()
            .position(|nft| nft.mint == nft_mint_key)
            .ok_or(error!(ErrorCode::NFTNotFound))?;

        let locked_nft = vault.locked_nfts.remove(nft_position);
        let lock_duration = clock.unix_timestamp - locked_nft.lock_time;
        let rent = calculate_rent(lock_duration);

        vault.nft_count -= 1;
        vault.total_rent += rent;

        let cpi_accounts = token::Transfer {
            from: ctx.accounts.vault_nft_account.to_account_info(),
            to: ctx.accounts.user_nft_account.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, 1)?;

        Ok(())
    }

    pub fn claim_rent(ctx: Context<ClaimRent>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        let rent_to_claim = vault.total_rent;
        vault.total_rent = 0;

        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.vault.key(),
            &ctx.accounts.authority.key(),
            rent_to_claim,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.authority.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        Ok(())
    }

    pub fn swap_sol_for_nft(ctx: Context<SwapSolForNFT>, amount: u64) -> Result<()> {
        // Check NFT availability
        if ctx.accounts.vault.nft_count == 0 {
            return Err(error!(ErrorCode::NoNFTsAvailable));
        }

        // Transfer SOL from user to vault
        anchor_lang::solana_program::program::invoke(
            &anchor_lang::solana_program::system_instruction::transfer(
                &ctx.accounts.user.key(),
                &ctx.accounts.vault.key(),
                amount,
            ),
            &[
                ctx.accounts.user.to_account_info(),
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        // Transfer NFT from vault to user
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.vault_nft_account.to_account_info(),
                    to: ctx.accounts.user_nft_account.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
            ),
            1,
        )?;

        // Update vault NFT count
        let vault = &mut ctx.accounts.vault;
        vault.nft_count -= 1;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(init, payer = authority, space = 8 + 32 + 4 + 8 + 1000, seeds = [b"vault"], bump)]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

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

#[derive(Accounts)]
pub struct ClaimRent<'info> {
    #[account(mut, has_one = authority)]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

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

#[account]
pub struct Vault {
    pub authority: Pubkey,
    pub nft_count: u32,
    pub total_rent: u64,
    pub locked_nfts: Vec<LockedNFT>,
}

#[account]
pub struct NFTData {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub mint: Pubkey,
    pub owner: Pubkey,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct LockedNFT {
    pub mint: Pubkey,
    pub lock_time: i64,
}

fn calculate_rent(lock_duration: i64) -> u64 {
    // 1 SOL per day
    ((lock_duration as f64) / 86400.0 * 1_000_000_000.0) as u64
}

#[error_code]
pub enum ErrorCode {
    #[msg("NFT not found in the vault")]
    NFTNotFound,
    #[msg("No NFTs available in the vault")]
    NoNFTsAvailable,
}
