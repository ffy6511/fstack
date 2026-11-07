# dsh-plugins

DSH 本地插件的开发约定。仓库整体规则见根 `AGENTS.md`；这里只写这个目录自己的事。

包自己的 `README.md` 面向使用者：安装、用法、支持的输入、已知限制。开发约定写在这里，不复制进每个包。

## 目录与命名

- 一个子目录一个独立 npm 包。目录名 `<短名>-plugin`，包名 `@fstack/dsh-<短名>`。
- 每个包自带 `README.md`；目录名单写在 `README.md` 的表格里，新增、改名、挪走时同步那一行。
- `package.json` 的 `dsh.bundle.patch` 指向本包的 `cordis.patch.yml`；`dsh.client` 声明平台和要注入的客户端包。

## 两个半区

- `index.js` 是 host 半：导出 `name`、`inject`、`apply`，在 `apply` 里注册工具、system prompt 段、session 投影等。`inject` 只写真正用到的服务。
- `client.js` 是浏览器半。可以直接手写；用构建的包改 `src/client/`，由 `scripts/build.mjs` 生成 `client.js`，构建产物不手改。
- 两半都可以缺省：只做 host 的插件不要空的 client 入口，反之亦然。

## 客户端 entry id 就是包名

- `client.js` 里 `window.__ModuleLoader__.load({ id })` 的 `id`、`cordis.patch.yml` 的 `name`、host 里 `clientModules.clientPath(...)` 的入参，都写包名。
- `cordis.patch.yml` 的 `id` 用短名（entry id），`name` 用包名。
- 改包名时，这些位置和测试里的断言、构建脚本里的 `id` 要一起改。

## 不往 session 里写自定义事件

- DSH 的 JSONL 后端读盘时拒绝未知且没有 `ignorable: true` 的事件类型，整条 session 打不开；而 `session.append()` 只接受 `surfaceOp` / `sourceEventSeqs`，插件给自己写的事件设不了 `ignorable`。
- 插件要的状态从已有事件 fold 出来：`tool/call`、`tool/result`、`turn/start`、`deliverables/presented` 之类。
- 需要跨轮聚合时用 session 投影（`ctx.sessionProjections.register`），不要发明事件类型。

## 会话投影

- 只在 host 侧用的投影可以不给 `wire`；客户端要读（`useProjection(key)`）就必须有 `wire: { viewSchema, view }`，否则值不会离开 host，客户端永远读到 `undefined`。
- `stateSchema` 和 `wire.viewSchema` 是 `{ parse(value) }`。字段名是 `stateSchema`，不是 `schema`。
- `apply(state, event)` 对不关心的事件返回同一个 state 引用；`wire.view` 也返回稳定引用，否则每个事件都会推一次。
- 改了 fold 语义或 state 字段就 bump `stateVersion`，旧 checkpoint 会被丢弃并按日志重算。

## 客户端注册

- `inject` 只列真的会用到的服务；服务名写错时表现是 entry 一直 pending、应用启动失败，报错只有一行 `waiting for service: <name>`。
- 组件里 hook 不能放在提前 `return` 之后：turn tail 这类容器会先在未完成状态挂载、之后再渲染，hook 数量变化会直接抛错。

## 构建与测试

- 有构建的包跑 `npm test`，它先 `scripts/build.mjs` 再 `node --test test/*.test.mjs`。
- 提交前跑仓库根的 `npx prettier --check .`。
- 装进 profile 后，host 半改动重启 DSH 生效；客户端 bundle 只在启动时加载，页面刷新不够。

## 安装与链接

- 安装：`dsh plugin --profile <profile> add ./dsh-plugins/<dir>`。相对路径按**执行命令的目录**解析，不要在 profile 目录里敲。
- profile 的 `package.json` 和 `node_modules` 是 `link:` 到源目录。移动或改名包目录后，要同步改各 profile 的依赖路径、`bundles` 名单和 `node_modules` 链接，再删旧路径。
- `desktop` profile 由 Electron 应用独占，CLI 不能 boot 也不能 `--dump-config`；验证只能重启应用，没有 crash 日志才算启动成。
- 顺手检查同名包是否还残留在其它 profile 里（`web`、`dsh-tui`），搜 `package.json` 和 `pnpm-lock.yaml`。

## 发布

- 没上 npm 的包，安装段写从仓库 checkout 装：`git clone` 后 `dsh plugin ... add ./dsh-plugins/<dir>`，不写作者机器上的绝对路径。
- `package.json` 的 `repository.directory` 指向 `dsh-plugins/<dir>`，`homepage` 用仓库对应子目录的链接。
