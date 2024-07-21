import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { NftVault } from "../target/types/nft_vault";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createMint, createAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { expect } from "chai";
import fs from "fs";

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

  it("Initializes the vault", async () => {
    const [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault")],
      program.programId
    );

    const vaultAuthority = Keypair.generate();

    console.log("vaultPda", vaultPda.toString())
    console.log("vaultBump", vaultBump)
    console.log("vaultAuthority", vaultAuthority.publicKey.toString())
    console.log("payer", payer.publicKey.toString())

    await provider.connection.requestAirdrop(payer.publicKey, 5 * LAMPORTS_PER_SOL)
    await provider.connection.requestAirdrop(vaultAuthority.publicKey, 5 * LAMPORTS_PER_SOL)

    await program.methods.initializeVault().accounts({
      vault: vaultPda,
      authority: vaultAuthority.publicKey,
      systemProgram: SystemProgram.programId,
    }).signers([vaultAuthority]).rpc()

    const vaultAccount = await program.account.vault.fetch(vaultPda);
    expect(vaultAccount.authority.toString()).to.equal(provider.wallet.publicKey.toString());
    expect(vaultAccount.nftCount).to.equal(0);
    expect(vaultAccount.totalRent).to.equal(0);
  })
});

/**
 * let vaultPda: PublicKey;
  let vaultBump: number;
  let mintKeypair: Keypair;
  let userTokenAccount: PublicKey;
  let vaultTokenAccount: PublicKey;

  const payer = Keypair.generate();
  const mintAuthority = Keypair.generate();
  const vaultAuthority = Keypair.generate();

  it("Initializes the vault", async () => {
    [vaultPda, vaultBump] = await PublicKey.findProgramAddress(
      [Buffer.from("vault")],
      program.programId
    );

    // Create mint
    mintKeypair = Keypair.generate();
    await createMint(
      provider.connection,
      payer,
      mintAuthority.publicKey,
      null,
      0,
      mintAuthority
    )

    userTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      payer,
      mintKeypair.publicKey,
      payer.publicKey
    );

    vaultTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      payer,
      mintKeypair.publicKey,
      vaultPda
    );

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
    expect(vaultAccount.authority.toString()).to.equal(provider.wallet.publicKey.toString());
    expect(vaultAccount.nftCount).to.equal(0);
    expect(vaultAccount.totalRent).to.equal(0);
  });

  it("Mints an NFT", async () => {
    const nftName = "Test NFT";
    const nftSymbol = "TNFT";
    const nftUri = "https://example.com/nft";

    const nftDataAccount = Keypair.generate();

    await program.methods
      .mintNft(nftName, nftSymbol, nftUri)
      .accounts({
        nftData: nftDataAccount.publicKey,
        mint: mintKeypair.publicKey,
        tokenAccount: userTokenAccount,
        payer: payer.publicKey,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
      })
      .signers([payer, nftDataAccount])
      .rpc();

    const nftDataAccountInfo = await program.account.nftData.fetch(nftDataAccount.publicKey);
    expect(nftDataAccountInfo.name).to.equal(nftName);
    expect(nftDataAccountInfo.symbol).to.equal(nftSymbol);
    expect(nftDataAccountInfo.uri).to.equal(nftUri);
    expect(nftDataAccountInfo.mint.toString()).to.equal(mintKeypair.publicKey.toString());
    expect(nftDataAccountInfo.owner.toString()).to.equal(payer.publicKey.toString());
  });

  it("Locks an NFT in the vault", async () => {
    await program.methods
      .lockNft()
      .accounts({
        vault: vaultPda,
        user: payer.publicKey,
        nftMint: mintKeypair.publicKey,
        userNftAccount: userTokenAccount,
        vaultNftAccount: vaultTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([payer])
      .rpc();

    const vaultAccount = await program.account.vault.fetch(vaultPda);
    expect(vaultAccount.nftCount).to.equal(1);
    expect(vaultAccount.lockedNfts[0].mint.toString()).to.equal(mintKeypair.publicKey.toString());
  });

  it("Unlocks an NFT from the vault", async () => {
    await program.methods
      .unlockNft()
      .accounts({
        vault: vaultPda,
        user: payer.publicKey,
        nftMint: mintKeypair.publicKey,
        userNftAccount: userTokenAccount,
        vaultNftAccount: vaultTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([payer])
      .rpc();

    const vaultAccount = await program.account.vault.fetch(vaultPda);
    expect(vaultAccount.nftCount).to.equal(0);
    expect(vaultAccount.lockedNfts).to.be.empty;
  });

  it("Claims rent from the vault", async () => {
    // First, we need to lock an NFT to generate some rent
    await program.methods
      .lockNft()
      .accounts({
        vault: vaultPda,
        user: payer.publicKey,
        nftMint: mintKeypair.publicKey,
        userNftAccount: userTokenAccount,
        vaultNftAccount: vaultTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([payer])
      .rpc();

    // Wait for a short period to accumulate some rent
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Now claim the rent
    await program.methods
      .claimRent()
      .accounts({
        vault: vaultPda,
        authority: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const vaultAccount = await program.account.vault.fetch(vaultPda);
    expect(vaultAccount.totalRent).to.equal(0);
  });

  it("Swaps SOL for an NFT", async () => {
    const swapAmount = new anchor.BN(1 * LAMPORTS_PER_SOL);

    await program.methods
      .swapSolForNft(swapAmount)
      .accounts({
        vault: vaultPda,
        user: payer.publicKey,
        nftMint: mintKeypair.publicKey,
        userNftAccount: userTokenAccount,
        vaultNftAccount: vaultTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([payer])
      .rpc();

    const vaultAccount = await program.account.vault.fetch(vaultPda);
    expect(vaultAccount.nftCount).to.equal(0);

    const userTokenBalance = await provider.connection.getTokenAccountBalance(userTokenAccount);
    expect(userTokenBalance.value.uiAmount).to.equal(1);
  });
 */