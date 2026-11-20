/**
 * Tomt projekt (SM-133): ett `app_projects`-projekt där inget bygge har börjat
 * och där användaren inte har lagt in något eget.
 *
 * Builderns auto-init, «Ny chatt», startsidan, landningen och kategorisidan
 * skapar projektet INNAN första bygget, och chatten skapas först efter Deep
 * Brief. Ett projekt utan något av nedanstående är därför bara en platshållare.
 * Det räknas inte mot projekttaket (`canCreateProject`) och visas inte i
 * `/projects` (`getAllProjectsForOwner`). Båda läser det här predikatet, så
 * listan och taket kan inte räkna olika.
 *
 * Principen: ett projekt göms bara när det bevisligen inte innehåller något
 * användaren har skapat. Ett projekt är STARTAT (synligt) när något av följande
 * finns:
 *
 * 1. publiceringsidentitet: `vercel_project_id`, `published_slug`,
 *    `branded_domain` eller `custom_domain`;
 * 2. i `project_data`: `chat_id`, `demo_url` eller `current_code` som inte är
 *    tomma, `files` eller `messages` som inte är tomma, eller användarens egna
 *    värden i `meta`: företagsuppgifter (`business`) eller miljövariabler
 *    (`projectEnvVars`). Paletten i `meta` sparas automatiskt för varje nytt
 *    projekt och räknas inte;
 * 3. en rad för projektet i `engine_chats` (första bygget, även om det sedan
 *    misslyckas), `domain_orders`, `project_files`, `images`, `media_library`
 *    eller `company_profiles`.
 *
 * Punkt 1, 2 och tabellerna utöver `engine_chats` är skyddsräcken för äldre
 * projekt (v0-eran, tidig egen motor, «Spara») och för sådant användaren lagt
 * in före första bygget. Hellre visa för mycket än dölja ett riktigt projekt.
 *
 * Inget raderas här. Tomma projekt ligger kvar i databasen och öppnas som
 * vanligt via `?project=` eller det senaste projektet i buildern.
 */
import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import {
  appProjects,
  companyProfiles,
  domainOrders,
  engineChats,
  images,
  mediaLibrary,
  projectData,
  projectFiles,
} from "@/lib/db/schema";

/** Användarens egna nycklar i `project_data.meta`. */
const USER_META_KEYS = ["business", "projectEnvVars"] as const;

function nonBlankText(column: AnyPgColumn): SQL {
  return sql`coalesce(btrim(${column}), '') <> ''`;
}

/** `null`, JSON-`null`, `[]` och `{}` räknas som tomt. */
function nonEmptyJson(value: SQL | AnyPgColumn): SQL {
  return sql`coalesce(${value}, 'null'::jsonb) not in ('null'::jsonb, '[]'::jsonb, '{}'::jsonb)`;
}

function hasRowFor(table: PgTable, projectColumn: AnyPgColumn): SQL {
  return sql`exists (select 1 from ${table} where ${projectColumn} = ${appProjects.id})`;
}

/** SQL-villkor mot den yttre `app_projects`-raden: sant för ett startat projekt. */
export function startedProjectCondition(): SQL {
  const projectDataContent = sql.join(
    [
      nonBlankText(projectData.chat_id),
      nonBlankText(projectData.demo_url),
      nonBlankText(projectData.current_code),
      nonEmptyJson(projectData.files),
      nonEmptyJson(projectData.messages),
      ...USER_META_KEYS.map((key) => nonEmptyJson(sql`${projectData.meta} -> ${sql.raw(`'${key}'`)}`)),
    ],
    sql` or `,
  );
  return sql`(
    ${appProjects.vercel_project_id} is not null
    or ${appProjects.published_slug} is not null
    or ${appProjects.branded_domain} is not null
    or ${appProjects.custom_domain} is not null
    or exists (
      select 1 from ${projectData}
       where ${projectData.project_id} = ${appProjects.id}
         and (${projectDataContent})
    )
    or ${hasRowFor(engineChats, engineChats.projectId)}
    or ${hasRowFor(domainOrders, domainOrders.project_id)}
    or ${hasRowFor(projectFiles, projectFiles.project_id)}
    or ${hasRowFor(images, images.project_id)}
    or ${hasRowFor(mediaLibrary, mediaLibrary.project_id)}
    or ${hasRowFor(companyProfiles, companyProfiles.project_id)}
  )`;
}
