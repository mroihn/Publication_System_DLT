import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany, OneToOne, Index } from 'typeorm';
import { UserEntity } from './user.entity';
import { ReviewEntity } from './review.entity';
import { PublicationEntity } from './publication.entity';

export enum ManuscriptStatus {
  SUBMITTED = 'SUBMITTED',
  CHECKING = 'CHECKING',
  UNDER_REVIEW = 'UNDER_REVIEW',
  REVISION_REQUESTED = 'REVISION_REQUESTED',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  PUBLISHED = 'PUBLISHED'
}

@Entity('manuscripts')
export class ManuscriptEntity {
  @PrimaryGeneratedColumn('uuid')
  manuscript_id: string;

  @Index()
  @Column({ type: 'varchar', length: 512 })
  title: string;

  @Column({ type: 'text' })
  abstract: string;

  @Column({ type: 'char', length: 42 })
  author_wallet: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'author_wallet', referencedColumnName: 'wallet_address' })
  author: UserEntity;

  @Column({ type: 'varchar', length: 128 })
  ipfs_cid: string;

  @Column({ type: 'enum', enum: ManuscriptStatus })
  status: ManuscriptStatus;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'char', length: 66 })
  tx_hash: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @OneToMany(() => ReviewEntity, (review) => review.manuscript)
  reviews: ReviewEntity[];

  @OneToOne(() => PublicationEntity, (pub) => pub.manuscript)
  publication: PublicationEntity;
}
