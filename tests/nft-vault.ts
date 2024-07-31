import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { NftVault } from "../target/types/nft_vault";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, createMint, createAssociatedTokenAccount, mintTo, getAssociatedTokenAddress } from "@solana/spl-token";
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
    vaultNftAccount = await createAssociatedTokenAccount(provider.connection, payer, vaultPda, nftMint);

    await program.methods
      .lockNft()
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
    expect(vaultAccount.nftCount).to.equal(1);
    expect(vaultAccount.lockedNfts[0].mint.toString()).to.equal(nftMint.toString());
  });

  // it("Unlocks an NFT", async () => {
  //   // Wait for a short time to simulate some lock duration
  //   await new Promise(resolve => setTimeout(resolve, 5000));

  //   await program.methods
  //     .unlockNft()
  //     .accounts({
  //       vault: vaultPda,
  //       user: payer.publicKey,
  //       nftMint: nftMint,
  //       userNftAccount: userNftAccount,
  //       vaultNftAccount: vaultNftAccount,
  //       tokenProgram: TOKEN_PROGRAM_ID,
  //       systemProgram: SystemProgram.programId,
  //     })
  //     .signers([payer])
  //     .rpc();

  //   const vaultAccount = await program.account.vault.fetch(vaultPda);
  //   expect(vaultAccount.nftCount).to.equal(0);
  //   expect(vaultAccount.lockedNfts).to.be.empty;
  //   expect(vaultAccount.totalRent.toNumber()).to.be.greaterThan(0);
  // });

  // it("Claims rent", async () => {
  //   const vaultAccount = await program.account.vault.fetch(vaultPda);
  //   const rentToClaim = vaultAccount.totalRent;

  //   const vaultBalanceBefore = await provider.connection.getBalance(vaultPda);
  //   const authorityBalanceBefore = await provider.connection.getBalance(vaultAuthority.publicKey);

  //   await program.methods
  //     .claimRent()
  //     .accounts({
  //       vault: vaultPda,
  //       authority: vaultAuthority.publicKey,
  //       systemProgram: SystemProgram.programId,
  //     })
  //     .signers([vaultAuthority])
  //     .rpc();

  //   const vaultBalanceAfter = await provider.connection.getBalance(vaultPda);
  //   const authorityBalanceAfter = await provider.connection.getBalance(vaultAuthority.publicKey);

  //   expect(vaultBalanceAfter).to.equal(vaultBalanceBefore - rentToClaim.toNumber());
  //   expect(authorityBalanceAfter).to.be.closeTo(authorityBalanceBefore + rentToClaim.toNumber(), 10000); // Allow for small discrepancy due to transaction fees

  //   const updatedVaultAccount = await program.account.vault.fetch(vaultPda);
  //   expect(updatedVaultAccount.totalRent.toNumber()).to.equal(0);
  // });

  // it("Swaps SOL for NFT", async () => {
  //   // First, lock an NFT in the vault
  //   await program.methods
  //     .lockNft()
  //     .accounts({
  //       vault: vaultPda,
  //       user: payer.publicKey,
  //       nftMint: nftMint,
  //       userNftAccount: userNftAccount,
  //       vaultNftAccount: vaultNftAccount,
  //       tokenProgram: TOKEN_PROGRAM_ID,
  //       systemProgram: SystemProgram.programId,
  //     })
  //     .signers([payer])
  //     .rpc();

  //   // Now, swap SOL for the NFT
  //   const swapAmount = new BN(LAMPORTS_PER_SOL); // 1 SOL

  //   const userBalanceBefore = await provider.connection.getBalance(payer.publicKey);
  //   const vaultBalanceBefore = await provider.connection.getBalance(vaultPda);

  //   await program.methods
  //     .swapSolForNft(swapAmount)
  //     .accounts({
  //       vault: vaultPda,
  //       user: payer.publicKey,
  //       nftMint: nftMint,
  //       userNftAccount: userNftAccount,
  //       vaultNftAccount: vaultNftAccount,
  //       tokenProgram: TOKEN_PROGRAM_ID,
  //       systemProgram: SystemProgram.programId,
  //     })
  //     .signers([payer])
  //     .rpc();

  //   const userBalanceAfter = await provider.connection.getBalance(payer.publicKey);
  //   const vaultBalanceAfter = await provider.connection.getBalance(vaultPda);

  //   expect(userBalanceAfter).to.be.closeTo(userBalanceBefore - swapAmount.toNumber(), 10000); // Allow for small discrepancy due to transaction fees
  //   expect(vaultBalanceAfter).to.equal(vaultBalanceBefore + swapAmount.toNumber());

  //   const vaultAccount = await program.account.vault.fetch(vaultPda);
  //   expect(vaultAccount.nftCount).to.equal(0);
  // });
});