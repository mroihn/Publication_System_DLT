import { Entity, PrimaryColumn, Column, CreateDateColumn, OneToOne, JoinColumn, OneToMany, Index } from 'typeorm';
import { ManuscriptEntity } from './manuscript.entity';
import { CommentEntity } from './comment.entity';

@Entity('publications')
@Index(['manuscript_id'])
@Index(['published_at'])
export class PublicationEntity {
  @PrimaryColumn({ type: 'bigint' })
  doi_nft_id: string;

  @Column({ type: 'uuid', unique: true })
  manuscript_id: string;

  @OneToOne(() => ManuscriptEntity, (ms) => ms.publication, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'manuscript_id' })
  manuscript: ManuscriptEntity;

  @Column({ type: 'varchar', length: 128 })
  ipfs_cid: string;

  @CreateDateColumn({ type: 'timestamptz' })
  published_at: Date;

  @OneToMany(() => CommentEntity, (comment) => comment.publication)
  comments: CommentEntity[];
}
