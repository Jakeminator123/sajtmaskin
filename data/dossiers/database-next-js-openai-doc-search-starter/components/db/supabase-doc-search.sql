create extension if not exists vector;

create table if not exists nods_page (
  id bigserial primary key,
  path text not null unique,
  type text not null,
  source text not null,
  meta jsonb,
  checksum text,
  parent_page_id bigint references nods_page(id) on delete set null
);

create table if not exists nods_page_section (
  id bigserial primary key,
  page_id bigint not null references nods_page(id) on delete cascade,
  slug text,
  heading text,
  content text not null,
  token_count integer,
  embedding vector(1536) not null
);

create index if not exists nods_page_section_page_id_idx
  on nods_page_section(page_id);

create index if not exists nods_page_section_embedding_idx
  on nods_page_section
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create or replace function match_page_sections(
  embedding vector(1536),
  match_threshold float,
  match_count int,
  min_content_length int
)
returns table (
  id bigint,
  page_id bigint,
  slug text,
  heading text,
  content text,
  similarity float
)
language sql
as $$
  select
    nods_page_section.id,
    nods_page_section.page_id,
    nods_page_section.slug,
    nods_page_section.heading,
    nods_page_section.content,
    1 - (nods_page_section.embedding <=> embedding) as similarity
  from nods_page_section
  where length(nods_page_section.content) >= min_content_length
    and 1 - (nods_page_section.embedding <=> embedding) > match_threshold
  order by nods_page_section.embedding <=> embedding
  limit match_count;
$$;
