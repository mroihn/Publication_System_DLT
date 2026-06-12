import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { ManuscriptEntity } from './manuscript.entity';

export enum ReviewVerdict {
  ACCEPT = 'ACCEPT',
  REJECT = 'REJECT',
  REVISE = 'REVISE'
}

@Entity('reviews')
@Index(['manuscript_id'])
@Index(['reviewer_wallet'])
@Index(['verdict'])
export class ReviewEntity {
  @PrimaryGeneratedColumn('uuid')
  review_id: string;

  @Column({ type: 'uuid' })
  manuscript_id: string;

  @ManyToOne(() => ManuscriptEntity, (ms) => ms.reviews, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'manuscript_id' })
  manuscript: ManuscriptEntity;

  @Column({ type: 'char', length: 42 })
  reviewer_wallet: string;

  @Column({ type: 'enum', enum: ReviewVerdict })
  verdict: ReviewVerdict;

  @Column({ type: 'varchar', length: 128 })
  comments_ipfs_cid: string;

  @Column({ type: 'int' })
  version: number;

  @Column({ type: 'char', length: 66 })
  tx_hash: string;

  @CreateDateColumn({ type: 'timestamptz' })
  submitted_at: Date;
}
