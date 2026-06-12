import { MigrationInterface, QueryRunner } from "typeorm";

export class InitSchema1781272550838 implements MigrationInterface {
    name = 'InitSchema1781272550838'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying(255) NOT NULL, "password" character varying(255), "wallet_address" character(42), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "UQ_196ef3e52525d3cd9e203bdb1de" UNIQUE ("wallet_address"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."reviews_verdict_enum" AS ENUM('ACCEPT', 'REJECT', 'REVISE')`);
        await queryRunner.query(`CREATE TABLE "reviews" ("review_id" uuid NOT NULL DEFAULT uuid_generate_v4(), "manuscript_id" uuid NOT NULL, "reviewer_wallet" character(42) NOT NULL, "verdict" "public"."reviews_verdict_enum" NOT NULL, "comments_ipfs_cid" character varying(128) NOT NULL, "version" integer NOT NULL, "tx_hash" character(66) NOT NULL, "submitted_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_bfe951d9dca4ba99674c5772905" PRIMARY KEY ("review_id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_8da2938e3f655d0ea5255e070c" ON "reviews"  ("verdict") `);
        await queryRunner.query(`CREATE INDEX "IDX_d4f76f2684459bd52f0de14601" ON "reviews"  ("reviewer_wallet") `);
        await queryRunner.query(`CREATE INDEX "IDX_d0f2858c8283bc18a22ae92c81" ON "reviews"  ("manuscript_id") `);
        await queryRunner.query(`CREATE TYPE "public"."manuscripts_status_enum" AS ENUM('SUBMITTED', 'CHECKING', 'UNDER_REVIEW', 'REVISION_REQUESTED', 'ACCEPTED', 'REJECTED', 'PUBLISHED')`);
        await queryRunner.query(`CREATE TABLE "manuscripts" ("manuscript_id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying(512) NOT NULL, "abstract" text NOT NULL, "author_wallet" character(42) NOT NULL, "ipfs_cid" character varying(128) NOT NULL, "status" "public"."manuscripts_status_enum" NOT NULL, "version" integer NOT NULL DEFAULT '1', "tx_hash" character(66) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_f8479ea34a4e659b592f6b45c55" PRIMARY KEY ("manuscript_id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_a2fca70a9ffa5b49c2b8ede983" ON "manuscripts"  ("title") `);
        await queryRunner.query(`CREATE TABLE "publications" ("doi_nft_id" bigint NOT NULL, "manuscript_id" uuid NOT NULL, "ipfs_cid" character varying(128) NOT NULL, "published_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_5e295c580152fa9466a0fb7d794" UNIQUE ("manuscript_id"), CONSTRAINT "REL_5e295c580152fa9466a0fb7d79" UNIQUE ("manuscript_id"), CONSTRAINT "PK_1d38be838c9334c1481b604fa03" PRIMARY KEY ("doi_nft_id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_772600d1d1e5ffc7f093559af2" ON "publications"  ("published_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_5e295c580152fa9466a0fb7d79" ON "publications"  ("manuscript_id") `);
        await queryRunner.query(`CREATE TABLE "comments" ("comment_id" uuid NOT NULL DEFAULT uuid_generate_v4(), "doi_nft_id" bigint NOT NULL, "reader_wallet" character(42) NOT NULL, "comment_text" text NOT NULL, "tx_hash" character(66) NOT NULL, "posted_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_eb0d76f2ca45d66a7de04c7c72b" PRIMARY KEY ("comment_id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_9ff7265a4b1bf46851710524ab" ON "comments"  ("posted_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_1a2d61004f21f0100f464982d7" ON "comments"  ("reader_wallet") `);
        await queryRunner.query(`CREATE INDEX "IDX_7635302f4138dca48c026d3e3a" ON "comments"  ("doi_nft_id") `);
        await queryRunner.query(`ALTER TABLE "reviews" ADD CONSTRAINT "FK_d0f2858c8283bc18a22ae92c812" FOREIGN KEY ("manuscript_id") REFERENCES "manuscripts"("manuscript_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "manuscripts" ADD CONSTRAINT "FK_3b1bd201c39ee4e8139695428a4" FOREIGN KEY ("author_wallet") REFERENCES "users"("wallet_address") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "publications" ADD CONSTRAINT "FK_5e295c580152fa9466a0fb7d794" FOREIGN KEY ("manuscript_id") REFERENCES "manuscripts"("manuscript_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "comments" ADD CONSTRAINT "FK_7635302f4138dca48c026d3e3ab" FOREIGN KEY ("doi_nft_id") REFERENCES "publications"("doi_nft_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "comments" DROP CONSTRAINT "FK_7635302f4138dca48c026d3e3ab"`);
        await queryRunner.query(`ALTER TABLE "publications" DROP CONSTRAINT "FK_5e295c580152fa9466a0fb7d794"`);
        await queryRunner.query(`ALTER TABLE "manuscripts" DROP CONSTRAINT "FK_3b1bd201c39ee4e8139695428a4"`);
        await queryRunner.query(`ALTER TABLE "reviews" DROP CONSTRAINT "FK_d0f2858c8283bc18a22ae92c812"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7635302f4138dca48c026d3e3a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_1a2d61004f21f0100f464982d7"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9ff7265a4b1bf46851710524ab"`);
        await queryRunner.query(`DROP TABLE "comments"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_5e295c580152fa9466a0fb7d79"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_772600d1d1e5ffc7f093559af2"`);
        await queryRunner.query(`DROP TABLE "publications"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a2fca70a9ffa5b49c2b8ede983"`);
        await queryRunner.query(`DROP TABLE "manuscripts"`);
        await queryRunner.query(`DROP TYPE "public"."manuscripts_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d0f2858c8283bc18a22ae92c81"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d4f76f2684459bd52f0de14601"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8da2938e3f655d0ea5255e070c"`);
        await queryRunner.query(`DROP TABLE "reviews"`);
        await queryRunner.query(`DROP TYPE "public"."reviews_verdict_enum"`);
        await queryRunner.query(`DROP TABLE "users"`);
    }

}
