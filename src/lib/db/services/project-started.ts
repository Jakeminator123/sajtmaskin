/**
 * Tomt, byggt och startat projekt (SM-133).
 *
 * Builderns auto-init, «Ny chatt», startsidan, landningen och kategorisidan
 * skapar projektet INNAN första bygget, och chatten skapas först efter Deep
 * Brief. Två frågor läser därför var sitt predikat här:
 *
 * - **Startat** (`startedProjectCondition`): projektet visas i `/projects` och
 *   räknas när ett nytt projekt skapas (`canCreateProject`). Principen: ett
 *   projekt göms bara när det bevisligen inte innehåller något användaren har
 *   skapat. Startat = byggt ELLER eget innehåll.
 * - **Byggt** (`builtProjectCondition`): det som räknas mot taket när ett tomt
 *   projekt får sin första chatt (`project-cap.ts`). Eget innehåll som
 *   användaren kan lägga in utan att bygga (företagsuppgifter, miljövariabler,
 *   uppladdningar) räknas inte här, så det går aldrig att bygga i fler projekt
 *   än taket genom att först fylla tomma projekt med inställningar.
 *
 * Byggt är när något av följande finns:
 *
 * 1. en rad i `engine_chats` (första bygget, även om det sedan misslyckas);
 * 2. publiceringsidentitet: `vercel_project_id`, `published_slug`,
 *    `branded_domain` eller `custom_domain`, eller en rad i `domain_orders`;
 * 3. i `project_data`: `chat_id`, `demo_url` eller `current_code` som inte är
 *    tomma, eller `files`/`messages` som inte är tomma (äldre projekt från
 *    v0-eran och tidig egen motor, import, mall, «Spara»).
 *
 * Eget innehåll (gör projektet startat men inte byggt):
 *
 * 4. i `project_data.meta`: företagsuppgifter (`business`) eller miljövariabler
 *    (`projectEnvVars`). Paletten sparas automatiskt för varje nytt projekt och
 *    räknas inte;
 * 5. en rad i `project_files`, `images`, `media_library` eller `company_profiles`.
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

function hasProjectData(condition: SQL): SQL {
  return sql`exists (
      select 1 from ${projectData}
       where ${projectData.project_id} = ${appProjects.id}
         and (${condition})
    )`;
}

/** SQL-villkor mot den yttre `app_projects`-raden: sant för ett byggt projekt. */
export function builtProjectCondition(): SQL {
  const builtData = sql.join(
    [
      nonBlankText(projectData.chat_id),
      nonBlankText(projectData.demo_url),
      nonBlankText(projectData.current_code),
      nonEmptyJson(projectData.files),
      nonEmptyJson(projectData.messages),
    ],
    sql` or `,
  );
  return sql`(
    ${appProjects.vercel_project_id} is not null
    or ${appProjects.published_slug} is not null
    or ${appProjects.branded_domain} is not null
    or ${appProjects.custom_domain} is not null
    or ${hasProjectData(builtData)}
    or ${hasRowFor(engineChats, engineChats.projectId)}
    or ${hasRowFor(domainOrders, domainOrders.project_id)}
  )`;
}

/** SQL-villkor mot den yttre `app_projects`-raden: sant för ett startat projekt. */
export function startedProjectCondition(): SQL {
  const userMeta = sql.join(
    USER_META_KEYS.map((key) => nonEmptyJson(sql`${projectData.meta} -> ${sql.raw(`'${key}'`)}`)),
    sql` or `,
  );
  return sql`(
    ${builtProjectCondition()}
    or ${hasProjectData(userMeta)}
    or ${hasRowFor(projectFiles, projectFiles.project_id)}
    or ${hasRowFor(images, images.project_id)}
    or ${hasRowFor(mediaLibrary, mediaLibrary.project_id)}
    or ${hasRowFor(companyProfiles, companyProfiles.project_id)}
  )`;
}
