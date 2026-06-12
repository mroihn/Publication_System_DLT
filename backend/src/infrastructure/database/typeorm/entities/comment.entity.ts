import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { PublicationEntity } from './publication.entity';

@Entity('comments')
@Index(['doi_nft_id'])
@Index(['reader_wallet'])
@Index(['posted_at'])
export class CommentEntity {
  @PrimaryGeneratedColumn('uuid')
  comment_id: string;

  @Column({ type: 'bigint' })
  doi_nft_id: string;

  @ManyToOne(() => PublicationEntity, (pub) => pub.comments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'doi_nft_id' })
  publication: PublicationEntity;

  @Column({ type: 'char', length: 42 })
  reader_wallet: string;

  @Column({ type: 'text' })
  comment_text: string;

  @Column({ type: 'char', length: 66 })
  tx_hash: string;

  @CreateDateColumn({ type: 'timestamptz' })
  posted_at: Date;
}
