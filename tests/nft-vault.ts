import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { NftVault } from "../target/types/nft_vault";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress, getAccount, getMint } from "@solana/spl-token";
import { expect } from "chai";
import fs from "fs";
import { BN } from "bn.js";

const loadKeypair = () => {
  let path = "/home/sudhan/.config/solana/id.json"
  let data = fs.readFileSync(path)
  let json = JSON.parse(data.toString())
  return Keypair.fromSecretKey(Uint8Array.from(json))
}

describe("nft-vault", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.NftVault as Program<NftVault>;
  const payer = loadKeypair();

  let vaultPda: PublicKey;
  let vaultBump: number;
  let nftMint: PublicKey;
  let userNftAccount: PublicKey;
  let vaultNftAccount: PublicKey;
  let rentTokenMint: PublicKey;
  let userRentTokenAccount: PublicKey;

  const vaultAuthority = payer;

  before(async () => {
    [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault")],
      program.programId
    );
  });

  it("Initializes the vault", async () => {
    await program.methods
      .initializeVault()
      .accounts({
        vault: vaultPda,
        authority: vaultAuthority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([vaultAuthority])
      .rpc();

    const vaultAccount = await program.account.vault.fetch(vaultPda);
    expect(vaultAccount.authority.toString()).to.equal(vaultAuthority.publicKey.toString());
    expect(vaultAccount.nftCount).to.equal(0);
    expect(vaultAccount.totalRent.toString()).to.equal(new BN(0).toString());
  });

  it("Initializes the rent token", async () => {
    const rentTokenMintKeypair = Keypair.generate();
    rentTokenMint = rentTokenMintKeypair.publicKey;

    await program.methods
      .initializeRentToken()
      .accounts({
        vault: vaultPda,
        rentTokenMint: rentTokenMint,
        authority: vaultAuthority.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([vaultAuthority, rentTokenMintKeypair])
      .rpc();

    const vaultAccount = await program.account.vault.fetch(vaultPda);
    expect(vaultAccount.rentTokenMint.toString()).to.equal(rentTokenMint.toString());

    const mintInfo = await getMint(provider.connection, rentTokenMint);
    expect(mintInfo.mintAuthority.toString()).to.equal(vaultPda.toString());
    expect(mintInfo.decimals).to.equal(9);
  });

  it("Mints an NFT", async () => {
    const nftMintKeypair = Keypair.generate();
    nftMint = nftMintKeypair.publicKey;

    const nftData = Keypair.generate();
    const name = "Test NFT";
    const symbol = "TNFT";
    const uri = "https://example.com/nft";

    await program.methods
      .mintNft(name, symbol, uri)
      .accounts({
        nftData: nftData.publicKey,
        mint: nftMint,
        tokenAccount: await getAssociatedTokenAddress(nftMint, payer.publicKey),
        payer: payer.publicKey,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([payer, nftMintKeypair, nftData])
      .rpc();

    const nftDataAccount = await program.account.nftData.fetch(nftData.publicKey);
    expect(nftDataAccount.name).to.equal(name);
    expect(nftDataAccount.symbol).to.equal(symbol);
    expect(nftDataAccount.uri).to.equal(uri);
    expect(nftDataAccount.mint.toString()).to.equal(nftMint.toString());
    expect(nftDataAccount.owner.toString()).to.equal(payer.publicKey.toString());
  });

  it("Locks an NFT", async () => {
    userNftAccount = await getAssociatedTokenAddress(nftMint, payer.publicKey);
    vaultNftAccount = await getAssociatedTokenAddress(nftMint, vaultPda, true);

    await program.methods
      .lockNft()
      .accounts({
        vault: vaultPda,
        user: payer.publicKey,
        nftMint: nftMint,
        userNftAccount: userNftAccount,
        vaultNftAccount: vaultNftAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([payer])
      .rpc();

    const vaultAccount = await program.account.vault.fetch(vaultPda);
    expect(vaultAccount.nftCount).to.equal(1);
    expect(vaultAccount.lockedNfts[0].mint.toString()).to.equal(nftMint.toString());

    const vaultNftAccountInfo = await getAccount(provider.connection, vaultNftAccount);
    expect(vaultNftAccountInfo.amount.toString()).to.equal("1");
  });

  it("Unlocks an NFT", async () => {
    await new Promise(resolve => setTimeout(resolve, 2000));

    await program.methods
      .unlockNft()
      .accounts({
        vault: vaultPda,
        user: payer.publicKey,
        nftMint: nftMint,
        userNftAccount: userNftAccount,
        vaultNftAccount: vaultNftAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([payer])
      .rpc();

    const vaultAccount = await program.account.vault.fetch(vaultPda);
    expect(vaultAccount.nftCount).to.equal(0);
    expect(vaultAccount.lockedNfts).to.be.empty;

    const userNftAccountInfo = await getAccount(provider.connection, userNftAccount);
    expect(userNftAccountInfo.amount.toString()).to.equal("1");

    expect(vaultAccount.totalRent.toNumber()).to.be.greaterThan(0);
  });

  it("Claims rent", async () => {
    expect((await program.account.vault.fetch(vaultPda)).totalRent.toNumber()).to.be.greaterThan(0);

    userRentTokenAccount = await getAssociatedTokenAddress(rentTokenMint, payer.publicKey);

    const vaultBeforeClaim = await program.account.vault.fetch(vaultPda);
    const rentToClaim = vaultBeforeClaim.totalRent;

    await program.methods
      .claimRent()
      .accounts({
        vault: vaultPda,
        user: payer.publicKey,
        rentTokenMint: rentTokenMint,
        userRentTokenAccount: userRentTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([payer])
      .rpc();

    const vaultAfterClaim = await program.account.vault.fetch(vaultPda);
    expect(vaultAfterClaim.totalRent.toNumber()).to.equal(0);

    const userRentTokenAccountInfo = await getAccount(provider.connection, userRentTokenAccount);
    expect(userRentTokenAccountInfo.amount.toString()).to.equal(rentToClaim.toString());
  });

  it("Fails to claim rent when there's no rent to claim", async () => {
    try {
      await program.methods
        .claimRent()
        .accounts({
          vault: vaultPda,
          user: payer.publicKey,
          rentTokenMint: rentTokenMint,
          userRentTokenAccount: userRentTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([payer])
        .rpc();
      expect.fail("The transaction should have failed");
    } catch (error) {
      expect(error.message).to.include("No rent to claim");
    }
  });

  it("Swap $SOL for NFT", async () => {
    const nftMintKeypair = Keypair.generate();
    nftMint = nftMintKeypair.publicKey;

    const nftData = Keypair.generate();
    const name = "Test NFT";
    const symbol = "TNFT";
    const uri = "https://example.com/nft";

    await program.methods
      .mintNft(name, symbol, uri)
      .accounts({
        nftData: nftData.publicKey,
        mint: nftMint,
        tokenAccount: await getAssociatedTokenAddress(nftMint, payer.publicKey),
        payer: payer.publicKey,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([payer, nftMintKeypair, nftData])
      .rpc();

    const userNftAccount = await getAssociatedTokenAddress(nftMint, payer.publicKey);
    const vaultNftAccount = await getAssociatedTokenAddress(nftMint, vaultPda, true);

    await program.methods
      .lockNft()
      .accounts({
        vault: vaultPda,
        user: payer.publicKey,
        nftMint: nftMint,
        userNftAccount: userNftAccount,
        vaultNftAccount: vaultNftAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([payer])
      .rpc();

    const vaultAccountBefore = await program.account.vault.fetch(vaultPda);
    expect(vaultAccountBefore.nftCount.toString()).to.equal("1");

    const swapAmount = new anchor.BN(1 * LAMPORTS_PER_SOL);
    const userBalanceBefore = await provider.connection.getBalance(payer.publicKey);
    const vaultBalanceBefore = await provider.connection.getBalance(vaultPda);

    await program.methods
      .swapSolForNft(swapAmount)
      .accounts({
        vault: vaultPda,
        user: payer.publicKey,
        nftMint: nftMint,
        userNftAccount: userNftAccount,
        vaultNftAccount: vaultNftAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([payer])
      .rpc();

    const vaultAccountAfter = await program.account.vault.fetch(vaultPda);
    expect(vaultAccountAfter.nftCount.toString()).to.equal("0");

    const userBalanceAfter = await provider.connection.getBalance(payer.publicKey);
    const vaultBalanceAfter = await provider.connection.getBalance(vaultPda);

    expect(userBalanceAfter).to.be.closeTo(userBalanceBefore - swapAmount.toNumber(), 10000); // Allow for transaction fees
    expect(vaultBalanceAfter).to.equal(vaultBalanceBefore + swapAmount.toNumber());

    const userNftAccountInfo = await getAccount(provider.connection, userNftAccount);
    expect(userNftAccountInfo.amount.toString()).to.equal("1");

    const vaultNftAccountInfo = await getAccount(provider.connection, vaultNftAccount);
    expect(vaultNftAccountInfo.amount.toString()).to.equal("0");
  });
});