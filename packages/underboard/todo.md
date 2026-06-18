$ pnpm build
$ tsc
src/cli/config.ts:50:5 - error TS2322: Type 'Partial<UnderboardConfig> | undefined' is not assignable to type 'ResolvableConfig<UnderboardConfig>'.
  Type 'Partial<UnderboardConfig>' is not assignable to type 'ResolvableConfig<UnderboardConfig>'.
    Type 'Partial<UnderboardConfig>' is not assignable to type 'UnderboardConfig'.
      Types of property 'port' are incompatible.
        Type 'number | undefined' is not assignable to type 'number'.
          Type 'undefined' is not assignable to type 'number'.

50     overrides,
       ~~~~~~~~~

  node_modules/.pnpm/c12@2.0.4/node_modules/c12/dist/index.d.mts:109:5
    109     overrides?: ResolvableConfig<T>;
            ~~~~~~~~~
    The expected type comes from property 'overrides' which is declared here on type 'LoadConfigOptions<UnderboardConfig, ConfigLayerMeta>'

src/cli/export.ts:3:32 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

3 import { createDatabase } from "#storage/database.ts";
                                 ~~~~~~~~~~~~~~~~~~~~~~

src/cli/import.ts:3:32 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

3 import { createDatabase } from "#storage/database.ts";
                                 ~~~~~~~~~~~~~~~~~~~~~~

src/cli/import.ts:4:1 - error TS6133: 'upsertProject' is declared but its value is never read.

4 import { upsertProject } from "#storage/project-store.ts";

  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

src/cli/import.ts:4:31 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

4 import { upsertProject } from "#storage/project-store.ts";
                                ~~~~~~~~~~~~~~~~~~~~~~~~~~~

src/cli/import.ts:5:1 - error TS6133: 'ProjectInfo' is declared but its value is never read.

5 import type { ProjectInfo } from "#project/detector.ts";
  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

src/cli/index.ts:19:42 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

19     const { startServer } = await import("#server/http-server.ts");
                                            ~~~~~~~~~~~~~~~~~~~~~~~~

src/cli/index.ts:27:42 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

27     const { stopService } = await import("#cli/stop.ts");
                                            ~~~~~~~~~~~~~~

src/cli/index.ts:35:41 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

35     const { showStatus } = await import("#cli/status.ts");
                                           ~~~~~~~~~~~~~~~~

src/cli/index.ts:45:41 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

45     const { fetchModel } = await import("#embedding/model-downloader.ts");
                                           ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

src/cli/index.ts:60:41 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

60     const { wipeMemory } = await import("#cli/wipe.ts");
                                           ~~~~~~~~~~~~~~

src/cli/index.ts:69:41 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

69     const { exportData } = await import("#cli/export.ts");
                                           ~~~~~~~~~~~~~~~~

src/cli/index.ts:78:41 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

78     const { importData } = await import("#cli/import.ts");
                                           ~~~~~~~~~~~~~~~~

src/cli/index.ts:89:41 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

89     const { deleteTask } = await import("#cli/task-delete.ts");
                                           ~~~~~~~~~~~~~~~~~~~~~

src/cli/status.ts:5:41 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

5     const { loadConfig } = await import("./config.ts");
                                          ~~~~~~~~~~~~~

src/cli/task-delete.ts:2:28 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

2 import { loadConfig } from "./config.ts";
                             ~~~~~~~~~~~~~

src/cli/wipe.ts:2:32 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

2 import { createDatabase } from "#storage/database.ts";
                                 ~~~~~~~~~~~~~~~~~~~~~~

src/embedding/backfill.ts:2:43 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

2 import { embed, getEmbeddingStatus } from "./embedding-service.ts";
                                            ~~~~~~~~~~~~~~~~~~~~~~~~

src/embedding/backfill.ts:3:55 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

3 import { getPendingEmbeddings, updateEmbedding } from "#storage/memory-store.ts";
                                                        ~~~~~~~~~~~~~~~~~~~~~~~~~~

src/embedding/embedding-service.ts:68:16 - error TS2532: Object is possibly 'undefined'.

68         sum += data[j * hiddenSize + i];
                  ~~~~~~~~~~~~~~~~~~~~~~~~

src/embedding/embedding-service.ts:75:15 - error TS2532: Object is possibly 'undefined'.

75       norm += result[i] * result[i];
                 ~~~~~~~~~

src/embedding/embedding-service.ts:75:27 - error TS2532: Object is possibly 'undefined'.

75       norm += result[i] * result[i];
                             ~~~~~~~~~

src/embedding/embedding-service.ts:80:9 - error TS2532: Object is possibly 'undefined'.

80         result[i] /= norm;
           ~~~~~~~~~

src/events/event-bus.ts:4:39 - error TS6133: 'getLatestEventId' is declared but its value is never read.

4 import { insertEvent, getEventsAfter, getLatestEventId, type EventRow } from "#storage/event-store.ts";
                                        ~~~~~~~~~~~~~~~~

src/events/event-bus.ts:4:78 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

4 import { insertEvent, getEventsAfter, getLatestEventId, type EventRow } from "#storage/event-store.ts";
                                                                               ~~~~~~~~~~~~~~~~~~~~~~~~~

src/index.ts:1:29 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

1 export { startServer } from "#server/http-server.ts";
                              ~~~~~~~~~~~~~~~~~~~~~~~~

src/index.ts:2:33 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

2 export { createMcpServer } from "#server/mcp-server.ts";
                                  ~~~~~~~~~~~~~~~~~~~~~~~

src/retrieval/hybrid-retrieval.ts:2:31 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

2 import { lexicalSearch } from "./lexical.ts";
                                ~~~~~~~~~~~~~~

src/retrieval/hybrid-retrieval.ts:3:50 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

3 import { semanticSearch, semanticSearchJS } from "./semantic.ts";
                                                   ~~~~~~~~~~~~~~~

src/retrieval/semantic.ts:45:12 - error TS2532: Object is possibly 'undefined'.

45     dot += a[i] * b[i];
              ~~~~

src/retrieval/semantic.ts:45:19 - error TS2532: Object is possibly 'undefined'.

45     dot += a[i] * b[i];
                     ~~~~

src/retrieval/semantic.ts:46:14 - error TS2532: Object is possibly 'undefined'.

46     normA += a[i] * a[i];
                ~~~~

src/retrieval/semantic.ts:46:21 - error TS2532: Object is possibly 'undefined'.

46     normA += a[i] * a[i];
                       ~~~~

src/retrieval/semantic.ts:47:14 - error TS2532: Object is possibly 'undefined'.

47     normB += b[i] * b[i];
                ~~~~

src/retrieval/semantic.ts:47:21 - error TS2532: Object is possibly 'undefined'.

47     normB += b[i] * b[i];
                       ~~~~

src/server/auth.ts:45:7 - error TS18048: 'token' is possibly 'undefined'.

45   if (token.length !== expectedToken.length) {
         ~~~~~

src/server/auth.ts:48:45 - error TS2769: No overload matches this call.
  The last overload gave the following error.
    Argument of type 'string | undefined' is not assignable to parameter of type 'WithImplicitCoercion<string | ArrayLike<number>>'.
      Type 'undefined' is not assignable to type 'WithImplicitCoercion<string | ArrayLike<number>>'.

48   return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expectedToken));
                                               ~~~~~

  node_modules/.pnpm/@types+node@22.19.20/node_modules/@types/node/buffer.buffer.d.ts:163:13
    163             from(arrayOrString: WithImplicitCoercion<ArrayLike<number> | string>): Buffer<ArrayBuffer>;
                    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    The last overload is declared here.

src/server/http-server.ts:7:33 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

7 import { createMcpServer } from "./mcp-server.ts";
                                  ~~~~~~~~~~~~~~~~~

src/server/http-server.ts:8:55 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

8 import { getOrCreateToken, validateBearerToken } from "./auth.ts";
                                                        ~~~~~~~~~~~

src/server/http-server.ts:9:48 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

9 import { createEventBus, type SseClient } from "#events/event-bus.ts";
                                                 ~~~~~~~~~~~~~~~~~~~~~~

src/server/http-server.ts:10:1 - error TS6133: 'getLatestEventId' is declared but its value is never read.

10 import { getLatestEventId } from "#storage/event-store.ts";
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

src/server/http-server.ts:10:34 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

10 import { getLatestEventId } from "#storage/event-store.ts";
                                    ~~~~~~~~~~~~~~~~~~~~~~~~~

src/server/http-server.ts:11:1 - error TS6133: 'listTasks' is declared but its value is never read.

11 import { listTasks } from "#storage/task-store.ts";

   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

src/server/http-server.ts:11:27 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

11 import { listTasks } from "#storage/task-store.ts";
                             ~~~~~~~~~~~~~~~~~~~~~~~~

src/server/http-server.ts:12:1 - error TS6133: 'listRecentMemory' is declared but its value is never read.

12 import { listRecentMemory } from "#storage/memory-store.ts";
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

src/server/http-server.ts:12:34 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

12 import { listRecentMemory } from "#storage/memory-store.ts";
                                    ~~~~~~~~~~~~~~~~~~~~~~~~~~

src/server/http-server.ts:13:36 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

13 import { getEmbeddingStatus } from "#embedding/embedding-service.ts";
                                      ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

src/server/http-server.ts:14:37 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

14 import { initializeEmbedding } from "#embedding/embedding-service.ts";
                                       ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

src/server/http-server.ts:15:47 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

15 import { createDatabase, closeDatabase } from "#storage/database.ts";
                                                 ~~~~~~~~~~~~~~~~~~~~~~

src/server/http-server.ts:33:50 - error TS6133: 'port' is declared but its value is never read.

33 function validateHost(req: http.IncomingMessage, port: number): boolean {
                                                    ~~~~

src/server/http-server.ts:203:34 - error TS1308: 'await' expressions are only allowed within async functions and at the top levels of modules.

203           const { taskCreate } = await import("#tools/tasks/create.ts");
                                     ~~~~~

  src/server/http-server.ts:200:21
    200       req.on("end", () => {
                            ~~~~~~~
    Did you mean to mark this function as 'async'?

src/server/http-server.ts:203:47 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

203           const { taskCreate } = await import("#tools/tasks/create.ts");
                                                  ~~~~~~~~~~~~~~~~~~~~~~~~

src/server/http-server.ts:205:37 - error TS1308: 'await' expressions are only allowed within async functions and at the top levels of modules.

205           const { detectProject } = await import("#project/detector.ts");
                                        ~~~~~

  src/server/http-server.ts:200:21
    200       req.on("end", () => {
                            ~~~~~~~
    Did you mean to mark this function as 'async'?

src/server/http-server.ts:205:50 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

205           const { detectProject } = await import("#project/detector.ts");
                                                     ~~~~~~~~~~~~~~~~~~~~~~

src/server/http-server.ts:206:37 - error TS1308: 'await' expressions are only allowed within async functions and at the top levels of modules.

206           const { upsertProject } = await import("#storage/project-store.ts");
                                        ~~~~~

  src/server/http-server.ts:200:21
    200       req.on("end", () => {
                            ~~~~~~~
    Did you mean to mark this function as 'async'?

src/server/http-server.ts:206:50 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

206           const { upsertProject } = await import("#storage/project-store.ts");
                                                     ~~~~~~~~~~~~~~~~~~~~~~~~~~~

src/server/http-server.ts:229:34 - error TS1308: 'await' expressions are only allowed within async functions and at the top levels of modules.

229           const { taskUpdate } = await import("#tools/tasks/update.ts");
                                     ~~~~~

  src/server/http-server.ts:225:21
    225       req.on("end", () => {
                            ~~~~~~~
    Did you mean to mark this function as 'async'?

src/server/http-server.ts:229:47 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

229           const { taskUpdate } = await import("#tools/tasks/update.ts");
                                                  ~~~~~~~~~~~~~~~~~~~~~~~~

src/server/http-server.ts:245:43 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

245       const { deleteTask } = await import("#storage/task-store.ts");
                                              ~~~~~~~~~~~~~~~~~~~~~~~~

src/server/mcp-server.ts:2:1 - error TS6133: 'SSEServerTransport' is declared but its value is never read.

2 import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

src/server/mcp-server.ts:3:1 - error TS6133: 'Server' is declared but its value is never read.

3 import type { Server } from "node:http";
  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

src/server/mcp-server.ts:5:29 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

5 import { memoryWrite } from "#tools/memory/write.ts";
                              ~~~~~~~~~~~~~~~~~~~~~~~~

src/server/mcp-server.ts:6:30 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

6 import { memoryRecall } from "#tools/memory/recall.ts";
                               ~~~~~~~~~~~~~~~~~~~~~~~~~

src/server/mcp-server.ts:7:34 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

7 import { memoryListRecent } from "#tools/memory/list-recent.ts";
                                   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

src/server/mcp-server.ts:8:27 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

8 import { memoryGet } from "#tools/memory/get.ts";
                            ~~~~~~~~~~~~~~~~~~~~~~

src/server/mcp-server.ts:9:30 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

9 import { memoryDelete } from "#tools/memory/delete.ts";
                               ~~~~~~~~~~~~~~~~~~~~~~~~~

src/server/mcp-server.ts:10:28 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

10 import { taskCreate } from "#tools/tasks/create.ts";
                              ~~~~~~~~~~~~~~~~~~~~~~~~

src/server/mcp-server.ts:11:28 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

11 import { taskUpdate } from "#tools/tasks/update.ts";
                              ~~~~~~~~~~~~~~~~~~~~~~~~

src/server/mcp-server.ts:12:26 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

12 import { taskList } from "#tools/tasks/list.ts";
                            ~~~~~~~~~~~~~~~~~~~~~~

src/server/mcp-server.ts:13:34 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

13 import { taskListAssigned } from "#tools/tasks/list-assigned.ts";
                                    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

src/server/mcp-server.ts:14:29 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

14 import { taskArchive } from "#tools/tasks/archive.ts";
                               ~~~~~~~~~~~~~~~~~~~~~~~~~

src/server/mcp-server.ts:15:31 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

15 import { detectProject } from "#project/detector.ts";
                                 ~~~~~~~~~~~~~~~~~~~~~~

src/server/mcp-server.ts:16:31 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

16 import { upsertProject } from "#storage/project-store.ts";
                                 ~~~~~~~~~~~~~~~~~~~~~~~~~~~

src/server/mcp-server.ts:42:31 - error TS2769: No overload matches this call.
  Overload 2 of 6, '(name: string, paramsSchema: ZodRawShapeCompat, annotations: { title?: string | undefined; readOnlyHint?: boolean | undefined; destructiveHint?: boolean | undefined; idempotentHint?: boolean | undefined; openWorldHint?: boolean | undefined; }, cb: (args: ShapeOutput<...>, extra: RequestHandlerExtra<...>) => { ...; } | Promise<...>): RegisteredTool', gave the following error.
    Argument of type 'string' is not assignable to parameter of type 'ZodRawShapeCompat'.

42   server.tool("memory_write", "Write a memory entry with dedup on content hash", {
                                 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~


src/server/mcp-server.ts:51:32 - error TS2769: No overload matches this call.
  Overload 2 of 6, '(name: string, paramsSchema: ZodRawShapeCompat, annotations: { title?: string | undefined; readOnlyHint?: boolean | undefined; destructiveHint?: boolean | undefined; idempotentHint?: boolean | undefined; openWorldHint?: boolean | undefined; }, cb: (args: ShapeOutput<...>, extra: RequestHandlerExtra<...>) => { ...; } | Promise<...>): RegisteredTool', gave the following error.
    Argument of type 'string' is not assignable to parameter of type 'ZodRawShapeCompat'.

51   server.tool("memory_recall", "Recall memories by semantic + lexical similarity", {
                                  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~


src/server/mcp-server.ts:61:10 - error TS2769: No overload matches this call.
  Overload 1 of 6, '(name: string, description: string, paramsSchemaOrAnnotations: ZodRawShapeCompat | { title?: string | undefined; readOnlyHint?: boolean | undefined; destructiveHint?: boolean | undefined; idempotentHint?: boolean | undefined; openWorldHint?: boolean | undefined; }, cb: (args: ShapeOutput<...>, extra: RequestHandlerExtra<...>) => { ...; } | Promise<...>): RegisteredTool', gave the following error.
    Object literal may only specify known properties, and 'type' does not exist in type 'AnySchema'.
  Overload 2 of 6, '(name: string, paramsSchema: ZodRawShapeCompat, annotations: { title?: string | undefined; readOnlyHint?: boolean | undefined; destructiveHint?: boolean | undefined; idempotentHint?: boolean | undefined; openWorldHint?: boolean | undefined; }, cb: (args: ShapeOutput<...>, extra: RequestHandlerExtra<...>) => { ...; } | Promise<...>): RegisteredTool', gave the following error.
    Argument of type 'string' is not assignable to parameter of type 'ZodRawShapeCompat'.

61   server.tool("memory_list_recent", "List recent memory entries", {
            ~~~~


src/server/mcp-server.ts:69:10 - error TS2769: No overload matches this call.
  Overload 1 of 6, '(name: string, description: string, paramsSchemaOrAnnotations: ZodRawShapeCompat | { title?: string | undefined; readOnlyHint?: boolean | undefined; destructiveHint?: boolean | undefined; idempotentHint?: boolean | undefined; openWorldHint?: boolean | undefined; }, cb: (args: ShapeOutput<...>, extra: RequestHandlerExtra<...>) => { ...; } | Promise<...>): RegisteredTool', gave the following error.
    Object literal may only specify known properties, and 'type' does not exist in type 'AnySchema'.
  Overload 2 of 6, '(name: string, paramsSchema: ZodRawShapeCompat, annotations: { title?: string | undefined; readOnlyHint?: boolean | undefined; destructiveHint?: boolean | undefined; idempotentHint?: boolean | undefined; openWorldHint?: boolean | undefined; }, cb: (args: ShapeOutput<...>, extra: RequestHandlerExtra<...>) => { ...; } | Promise<...>): RegisteredTool', gave the following error.
    Argument of type 'string' is not assignable to parameter of type 'ZodRawShapeCompat'.

69   server.tool("memory_get", "Get a full memory entry by ID", {
            ~~~~


src/server/mcp-server.ts:76:10 - error TS2769: No overload matches this call.
  Overload 1 of 6, '(name: string, description: string, paramsSchemaOrAnnotations: ZodRawShapeCompat | { title?: string | undefined; readOnlyHint?: boolean | undefined; destructiveHint?: boolean | undefined; idempotentHint?: boolean | undefined; openWorldHint?: boolean | undefined; }, cb: (args: ShapeOutput<...>, extra: RequestHandlerExtra<...>) => { ...; } | Promise<...>): RegisteredTool', gave the following error.
    Object literal may only specify known properties, and 'type' does not exist in type 'AnySchema'.
  Overload 2 of 6, '(name: string, paramsSchema: ZodRawShapeCompat, annotations: { title?: string | undefined; readOnlyHint?: boolean | undefined; destructiveHint?: boolean | undefined; idempotentHint?: boolean | undefined; openWorldHint?: boolean | undefined; }, cb: (args: ShapeOutput<...>, extra: RequestHandlerExtra<...>) => { ...; } | Promise<...>): RegisteredTool', gave the following error.
    Argument of type 'string' is not assignable to parameter of type 'ZodRawShapeCompat'.

76   server.tool("memory_delete", "Delete a memory entry (scoped to current project)", {
            ~~~~


src/server/mcp-server.ts:84:30 - error TS2769: No overload matches this call.
  Overload 2 of 6, '(name: string, paramsSchema: ZodRawShapeCompat, annotations: { title?: string | undefined; readOnlyHint?: boolean | undefined; destructiveHint?: boolean | undefined; idempotentHint?: boolean | undefined; openWorldHint?: boolean | undefined; }, cb: (args: ShapeOutput<...>, extra: RequestHandlerExtra<...>) => { ...; } | Promise<...>): RegisteredTool', gave the following error.
    Argument of type 'string' is not assignable to parameter of type 'ZodRawShapeCompat'.

84   server.tool("task_create", "Create a new task on the board", {
                                ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~


src/server/mcp-server.ts:96:30 - error TS2769: No overload matches this call.
  Overload 2 of 6, '(name: string, paramsSchema: ZodRawShapeCompat, annotations: { title?: string | undefined; readOnlyHint?: boolean | undefined; destructiveHint?: boolean | undefined; idempotentHint?: boolean | undefined; openWorldHint?: boolean | undefined; }, cb: (args: ShapeOutput<...>, extra: RequestHandlerExtra<...>) => { ...; } | Promise<...>): RegisteredTool', gave the following error.
    Argument of type 'string' is not assignable to parameter of type 'ZodRawShapeCompat'.

96   server.tool("task_update", "Update an existing task", {
                                ~~~~~~~~~~~~~~~~~~~~~~~~~


src/server/mcp-server.ts:109:28 - error TS2769: No overload matches this call.
  Overload 2 of 6, '(name: string, paramsSchema: ZodRawShapeCompat, annotations: { title?: string | undefined; readOnlyHint?: boolean | undefined; destructiveHint?: boolean | undefined; idempotentHint?: boolean | undefined; openWorldHint?: boolean | undefined; }, cb: (args: ShapeOutput<...>, extra: RequestHandlerExtra<...>) => { ...; } | Promise<...>): RegisteredTool', gave the following error.
    Argument of type 'string' is not assignable to parameter of type 'ZodRawShapeCompat'.

109   server.tool("task_list", "List tasks with filters", {
                               ~~~~~~~~~~~~~~~~~~~~~~~~~


src/server/mcp-server.ts:122:37 - error TS2769: No overload matches this call.
  Overload 2 of 6, '(name: string, paramsSchema: ZodRawShapeCompat, annotations: { title?: string | undefined; readOnlyHint?: boolean | undefined; destructiveHint?: boolean | undefined; idempotentHint?: boolean | undefined; openWorldHint?: boolean | undefined; }, cb: (args: ShapeOutput<...>, extra: RequestHandlerExtra<...>) => { ...; } | Promise<...>): RegisteredTool', gave the following error.
    Argument of type 'string' is not assignable to parameter of type 'ZodRawShapeCompat'.

122   server.tool("task_list_assigned", "List tasks assigned to calling agent", {
                                        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~


src/server/mcp-server.ts:131:10 - error TS2769: No overload matches this call.
  Overload 1 of 6, '(name: string, description: string, paramsSchemaOrAnnotations: ZodRawShapeCompat | { title?: string | undefined; readOnlyHint?: boolean | undefined; destructiveHint?: boolean | undefined; idempotentHint?: boolean | undefined; openWorldHint?: boolean | undefined; }, cb: (args: ShapeOutput<...>, extra: RequestHandlerExtra<...>) => { ...; } | Promise<...>): RegisteredTool', gave the following error.
    Object literal may only specify known properties, and 'type' does not exist in type 'AnySchema'.
  Overload 2 of 6, '(name: string, paramsSchema: ZodRawShapeCompat, annotations: { title?: string | undefined; readOnlyHint?: boolean | undefined; destructiveHint?: boolean | undefined; idempotentHint?: boolean | undefined; openWorldHint?: boolean | undefined; }, cb: (args: ShapeOutput<...>, extra: RequestHandlerExtra<...>) => { ...; } | Promise<...>): RegisteredTool', gave the following error.
    Argument of type 'string' is not assignable to parameter of type 'ZodRawShapeCompat'.

131   server.tool("task_archive", "Archive a task", {
             ~~~~


src/tools/emit-event.ts:2:29 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

2 import { insertEvent } from "#storage/event-store.ts";
                              ~~~~~~~~~~~~~~~~~~~~~~~~~

src/tools/emit-event.ts:3:29 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

3 import { getEventBus } from "#events/event-bus.ts";
                              ~~~~~~~~~~~~~~~~~~~~~~

src/tools/memory/delete-cross.ts:2:42 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

2 import { deleteMemoryCrossProject } from "#storage/memory-store.ts";
                                           ~~~~~~~~~~~~~~~~~~~~~~~~~~

src/tools/memory/delete-cross.ts:3:27 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

3 import { emitEvent } from "#tools/emit-event.ts";
                            ~~~~~~~~~~~~~~~~~~~~~~

src/tools/memory/delete.ts:2:30 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

2 import { deleteMemory } from "#storage/memory-store.ts";
                               ~~~~~~~~~~~~~~~~~~~~~~~~~~

src/tools/memory/delete.ts:3:27 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

3 import { emitEvent } from "#tools/emit-event.ts";
                            ~~~~~~~~~~~~~~~~~~~~~~

src/tools/memory/get.ts:2:26 - error TS6133: 'MemoryRow' is declared but its value is never read.

2 import { getMemory, type MemoryRow } from "#storage/memory-store.ts";
                           ~~~~~~~~~

src/tools/memory/get.ts:2:43 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

2 import { getMemory, type MemoryRow } from "#storage/memory-store.ts";
                                            ~~~~~~~~~~~~~~~~~~~~~~~~~~

src/tools/memory/list-recent.ts:2:50 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

2 import { listRecentMemory, type MemoryRow } from "#storage/memory-store.ts";
                                                   ~~~~~~~~~~~~~~~~~~~~~~~~~~

src/tools/memory/recall-cross.ts:2:32 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

2 import { hybridRetrieve } from "#retrieval/hybrid-retrieval.ts";
                                 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

src/tools/memory/recall-cross.ts:3:43 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

3 import { embed, getEmbeddingStatus } from "#embedding/embedding-service.ts";
                                            ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

src/tools/memory/recall-cross.ts:4:32 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

4 import { getAllProjects } from "#storage/project-store.ts";
                                 ~~~~~~~~~~~~~~~~~~~~~~~~~~~

src/tools/memory/recall.ts:2:51 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

2 import { hybridRetrieve, type HybridResult } from "#retrieval/hybrid-retrieval.ts";
                                                    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

src/tools/memory/recall.ts:3:43 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

3 import { embed, getEmbeddingStatus } from "#embedding/embedding-service.ts";
                                            ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

src/tools/memory/write.ts:3:23 - error TS6133: 'computeContentHash' is declared but its value is never read.

3 import { writeMemory, computeContentHash } from "#storage/memory-store.ts";
                        ~~~~~~~~~~~~~~~~~~

src/tools/memory/write.ts:3:49 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

3 import { writeMemory, computeContentHash } from "#storage/memory-store.ts";
                                                  ~~~~~~~~~~~~~~~~~~~~~~~~~~

src/tools/memory/write.ts:4:27 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

4 import { emitEvent } from "#tools/emit-event.ts";
                            ~~~~~~~~~~~~~~~~~~~~~~

src/tools/tasks/activity-log.ts:3:27 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

3 import { emitEvent } from "#tools/emit-event.ts";
                            ~~~~~~~~~~~~~~~~~~~~~~

src/tools/tasks/activity-log.ts:8:3 - error TS6133: 'context' is declared but its value is never read.

8   context: { agent_name: string }
    ~~~~~~~

src/tools/tasks/archive.ts:2:42 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

2 import { updateTask, type TaskRow } from "#storage/task-store.ts";
                                           ~~~~~~~~~~~~~~~~~~~~~~~~

src/tools/tasks/archive.ts:3:27 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

3 import { emitEvent } from "#tools/emit-event.ts";
                            ~~~~~~~~~~~~~~~~~~~~~~

src/tools/tasks/create.ts:3:42 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

3 import { createTask, type TaskRow } from "#storage/task-store.ts";
                                           ~~~~~~~~~~~~~~~~~~~~~~~~

src/tools/tasks/create.ts:4:27 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

4 import { emitEvent } from "#tools/emit-event.ts";
                            ~~~~~~~~~~~~~~~~~~~~~~

src/tools/tasks/list-assigned-cross.ts:2:61 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

2 import { listAssignedTasksCrossProject, type TaskRow } from "#storage/task-store.ts";
                                                              ~~~~~~~~~~~~~~~~~~~~~~~~

src/tools/tasks/list-assigned.ts:2:49 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

2 import { listAssignedTasks, type TaskRow } from "#storage/task-store.ts";
                                                  ~~~~~~~~~~~~~~~~~~~~~~~~

src/tools/tasks/list.ts:2:21 - error TS6133: 'listAssignedTasks' is declared but its value is never read.

2 import { listTasks, listAssignedTasks, type TaskRow } from "#storage/task-store.ts";
                      ~~~~~~~~~~~~~~~~~

src/tools/tasks/list.ts:2:60 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

2 import { listTasks, listAssignedTasks, type TaskRow } from "#storage/task-store.ts";
                                                             ~~~~~~~~~~~~~~~~~~~~~~~~

src/tools/tasks/update.ts:2:42 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

2 import { updateTask, type TaskRow } from "#storage/task-store.ts";
                                           ~~~~~~~~~~~~~~~~~~~~~~~~

src/tools/tasks/update.ts:3:27 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

3 import { emitEvent } from "#tools/emit-event.ts";
                            ~~~~~~~~~~~~~~~~~~~~~~


Found 112 errors in 31 files.

Errors  Files
     1  src/cli/config.ts:50
     1  src/cli/export.ts:3
     4  src/cli/import.ts:3
     8  src/cli/index.ts:19
     1  src/cli/status.ts:5
     1  src/cli/task-delete.ts:2
     1  src/cli/wipe.ts:2
     2  src/embedding/backfill.ts:2
     4  src/embedding/embedding-service.ts:68
     2  src/events/event-bus.ts:4
     2  src/index.ts:1
     2  src/retrieval/hybrid-retrieval.ts:2
     6  src/retrieval/semantic.ts:45
     2  src/server/auth.ts:45
    22  src/server/http-server.ts:7
    24  src/server/mcp-server.ts:2
     2  src/tools/emit-event.ts:2
     2  src/tools/memory/delete-cross.ts:2
     2  src/tools/memory/delete.ts:2
     2  src/tools/memory/get.ts:2
     1  src/tools/memory/list-recent.ts:2
     3  src/tools/memory/recall-cross.ts:2
     2  src/tools/memory/recall.ts:2
     3  src/tools/memory/write.ts:3
     2  src/tools/tasks/activity-log.ts:3
     2  src/tools/tasks/archive.ts:2
     2  src/tools/tasks/create.ts:3
     1  src/tools/tasks/list-assigned-cross.ts:2
     1  src/tools/tasks/list-assigned.ts:2
     2  src/tools/tasks/list.ts:2
     2  src/tools/tasks/update.ts:2
[ELIFECYCLE] Command failed with exit code 2.
