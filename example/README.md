# 组合示例（example）

★这一份回答的问题只有一个：**六个件怎么接起来**。
（只给包、不给接法 ⇒ 别人拿到手装不起来。这一份就是那份"接法"。）

## 一、最小接线（`cordis.patch.yml`）

```yaml
- insert:
    - id: whale-roster-json
      name: dsh-whale-post-roster
      config:
        file: '~/.dsh/whale-mail/roster.json'   # 名单内容由你填（格式见下）

    - id: whale-types-sample
      name: dsh-whale-post-types
      config:
        types: [direct, broadcast, club]         # 随包三个样例；你自己的类型自己注册

    - id: whale-bus
      name: dsh-whale-post-bus
      config:
        root: '~/.dsh/whale-mail'
        requireHello: true                       # 协议不许"像 UDP 那样"直接发

    - id: whale-deliver
      name: dsh-whale-post-deliver               # 示例①：离线邮局（离线＝留着，在线＝投出去）

    - id: whale-gate
      name: dsh-whale-post-gate                  # 示例②：配额与计费闸 ＋ 回环闸
      config:
        quota:
          onOver: reject                         # reject 拒发 ＋ 退出码非 0 ／ price 照发但计费
          types:
            direct:    { label: 'direct',    limit: 100 }
            broadcast: { label: 'broadcast', limit: 45 }
            club:      { label: 'club',      limit: 40 }
            offline:   { label: '离线',      limit: 80, perSend: true }   # ★离线件按发信次数计
```

★**顺序无关**：五个插件之间只靠接口（`ctx.whale.*`）—— 核心不认识任何名字与类型标识。

## 二、名单文件（`roster.json`）

```json
{ "apiVersion": 1,
  "members": [ { "id": "alice", "label": "Alice" },
               { "id": "bob",   "label": "Bob" } ],
  "groups": { "all": ["alice", "bob"] } }
```

`id` 就是信箱目录名（`<root>/inbox/<id>/`）。★**名单只在这个文件里**，代码里一个名字都没有。

## 三、跑一次（判据：退出码）

```bash
# 用 CLI 起一个临时邮局（不动你的真数据）
node packages/cli/index.js hello --as alice --root ./tmp-mail
node packages/cli/index.js hello --as bob   --root ./tmp-mail
node packages/cli/index.js send  --as alice --to bob --subject 第一封 --body '离线件：等你来收' --root ./tmp-mail
node packages/cli/index.js pump  --as bob --root ./tmp-mail      # ⇒ 拉到 1 封（离线件）
node packages/cli/index.js quota --as alice --root ./tmp-mail    # ⇒ 离线 1 条
echo $?    # 0 ＝ 过
```

★**离线件不会丢**：`send` 之后信就躺在 `inbox/bob/` 里；`bob` 什么时候来收都行（没有活体会话 ⇒ **不投也不消费** ⇒ 信只会晚到，不会不到）。

★**要看在线投递**：给收件人标上"此刻有活体会话"——

```bash
node packages/cli/index.js send --as alice --to bob --mode online --live bob \
  --subject '要你动手' --body '在线件：立刻投进你的会话' --root ./tmp-mail
```

## 四、各件自测

```bash
node scripts/selftest-all.mjs        # 六件一把跑完（退出码 0 ＝ 全过）
node packages/bus/selftest.mjs       # 单件跑（看细节）
```

★每条判据都守着一条真实事故（见 [`../docs/ACCEPTANCE.md`](../docs/ACCEPTANCE.md)）。
