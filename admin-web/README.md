# 刷题通Pro独立后台网页

这是一个静态后台网页，可部署到 GitHub Pages、CloudBase 静态托管或任意 HTTPS 静态托管服务。

## 1. 配置后台网页

编辑 `config.js`：

```js
window.STP_ADMIN_CONFIG = {
  envId: '你的云开发环境ID',
  functionName: 'stpAdmin',
  appName: '刷题通Pro后台',
  defaultAdminAccount: '842611586',
};
```

云开发环境 ID 可在微信开发者工具“云开发”面板中查看。

## 2. 开启 Web 访问权限

独立后台网页属于 Web 端访问云开发，需要在云开发控制台补齐两项：

1. 进入云开发控制台，打开当前环境。
2. 在“身份认证 / 登录方式”中开启“匿名登录”。
3. 在“环境配置 / 安全来源 / 安全域名”中添加后台网页域名。

如果使用 GitHub Pages，添加类似：

```text
https://你的GitHub用户名.github.io
```

如果本地测试，不要直接双击打开 `index.html`，建议使用本地服务访问，例如：

```bash
cd admin-web
python3 -m http.server 5178
```

然后在浏览器打开 `http://127.0.0.1:5178`，并把 `http://127.0.0.1:5178` 也加入安全来源。

## 3. 配置云函数环境变量

在微信开发者工具中打开云函数 `stpAdmin` 的环境变量，新增：

- `ADMIN_WEB_ACCOUNT`：后台管理员账号，本项目配置为 `842611586`
- `ADMIN_WEB_PASSWORD_SHA256`：管理员密码的 SHA-256 哈希值

本项目当前管理员密码哈希：

```text
91541027ccc40dba104681ec1a5374aa489997bd4414cffdec68d29369c03a66
```

不要把明文密码写进网页文件。

在 macOS 终端生成密码哈希示例：

```bash
printf '你的管理员密码' | shasum -a 256
```

复制输出的 64 位哈希到 `ADMIN_WEB_PASSWORD_SHA256`。

## 4. 重新部署云函数

右键 `cloudfunctions/stpAdmin`，选择：

`上传并部署：云端安装依赖`

## 5. 部署静态网页

GitHub Pages 方式：

1. 新建一个 GitHub 仓库。
2. 上传 `admin-web` 目录中的 `index.html`、`styles.css`、`app.js`、`config.js`。
3. 在仓库 Settings -> Pages 启用 GitHub Pages。
4. 打开生成的网址，输入管理员账号和密码登录。

## 安全说明

- GitHub Pages 只能托管静态文件，真正权限校验在云函数里。
- 网页里不要放管理员密码、Token、云密钥。
- 登录成功后的 Token 默认 2 小时过期，关闭浏览器也会失效。
- 所有积分调整和授权调整都会写入 `adminAuditLogs` 集合。
