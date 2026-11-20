/**
 * Tomt projekt (SM-133): ett `app_projects`-projekt där inget bygge har börjat.
 *
 * Builderns auto-init, «Ny chatt», startsidan, landningen och kategorisidan
 * skapar projektet INNAN första bygget, och chatten skapas först efter Deep
 * Brief. Ett projekt som aldrig fick någon chatt är därför bara en platshållare.
 * Det räknas inte mot projekttaket (`canCreateProject`) och visas inte i
 * `/projects` (`getAllProjectsForOwner`). Båda läser det här predikatet, så
 * listan och taket kan inte räkna olika.
 *
 * Ett projekt är STARTAT när något av följande finns:
 *
 * 1. en `engine_chats`-rad för projektet — skapas vid första bygget, även om
 *    bygget sedan misslyckas;
 * 2. `project_data.chat_id` eller `project_data.demo_url` (äldre projekt,
 *    import, mall och «Spara» skriver dem);
 * 3. en `domain_orders`-rad;
 * 4. publiceringsidentitet: `vercel_project_id`, `published_slug`,
 *    `branded_domain` eller `custom_domain`.
 *
 * Punkt 2–4 är skyddsräcken. En publicering kräver redan en chatt, men
 * definitionen ska hellre visa för mycket än dölja ett projekt med en sajt.
 *
 * Inget raderas här. Tomma projekt ligger kvar i databasen och öppnas som
 * vanligt via `?project=` eller det senaste projektet i buildern.
 */
import { sql, type SQL } from "drizzle-orm";
import { appProjects, domainOrders, engineChats, projectData } from "@/lib/db/schema";

/** SQL-villkor mot den yttre `app_projects`-raden: sant för ett startat projekt. */
export function startedProjectCondition(): SQL {
  return sql`(
    exists (select 1 from ${engineChats} where ${engineChats.projectId} = ${appProjects.id})
    or exists (
      select 1 from ${projectData}
       where ${projectData.project_id} = ${appProjects.id}
         and (
           coalesce(btrim(${projectData.chat_id}), '') <> ''
           or coalesce(btrim(${projectData.demo_url}), '') <> ''
         )
    )
    or exists (select 1 from ${domainOrders} where ${domainOrders.project_id} = ${appProjects.id})
    or ${appProjects.vercel_project_id} is not null
    or ${appProjects.published_slug} is not null
    or ${appProjects.branded_domain} is not null
    or ${appProjects.custom_domain} is not null
  )`;
}
