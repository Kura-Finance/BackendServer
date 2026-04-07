# 项目目录结构 - Domain-Based Architecture

## 完整目录树

```
kura-backend/
├── src/
│   ├── index.ts                           # 主应用入口
│   │
│   └── domains/                           # 领域驱动模块
│       │
│       ├── auth/                          # 认证与用户管理域
│       │   ├── controllers/
│       │   │   └── authController.ts      # 注册、登录、资料管理
│       │   ├── middleware/
│       │   │   └── auth.ts               # Token 验证中间件
│       │   └── index.ts                  # 公共导出接口
│       │
│       ├── plaid/                         # Plaid 财务集成域
│       │   ├── controllers/
│       │   │   └── plaidController.ts     # 账户、交易、投资管理
│       │   ├── lib/
│       │   │   └── plaid.ts              # Plaid API 配置
│       │   └── index.ts                  # 公共导出接口
│       │
│       ├── logger/                        # Winston 日志系统域
│       │   ├── logger.ts                 # Logger 核心配置
│       │   ├── logger.util.ts            # 日志工具函数
│       │   ├── logger.middleware.ts      # Express 日志中间件
│       │   └── index.ts                  # 公共导出接口
│       │
│       └── shared/                        # 共享库
│           ├── lib/
│           │   └── prisma.ts             # Prisma 数据库连接
│           └── index.ts                  # 公共导出接口
│
├── prisma/
│   ├── schema.prisma                      # 数据模型定义
│   └── migrations/                        # 数据库迁移
│
├── certificates/                          # SSL 证书
│
├── logs/                                  # 日志文件（自动生成）
│   ├── app-YYYY-MM-DD.log
│   ├── error-YYYY-MM-DD.log
│   ├── warn-YYYY-MM-DD.log
│   ├── exceptions.log
│   └── rejections.log
│
├── .gitignore                             # Git 忽略配置
├── .env.development                       # 开发环境变量
├── .env.production                        # 生产环境变量
│
├── package.json                           # 项目依赖
├── tsconfig.json                          # TypeScript 配置
├── prisma.config.ts                       # Prisma 配置
│
├── Dockerfile                             # Docker 镜像定义
├── docker-compose.yml                     # Docker Compose 配置
│
├── LOGGER_README.md                       # Winston Logger 使用指南
├── MIGRATION_GUIDE.md                     # Domain-Based 迁移指南
└── README.md                              # 项目说明
```

## Domain 详细说明

### 🔐 Auth Domain
**路径**: `src/domains/auth/`

负责用户认证和管理：
```
auth/
├── controllers/authController.ts
│   ├── register()        # 用户注册
│   ├── login()          # 用户登录
│   ├── me()             # 获取用户信息
│   └── updateProfile()  # 更新用户资料
├── middleware/auth.ts
│   └── requireAuth()    # Token 验证中间件
└── index.ts             # 导出接口
```

**导入示例**:
```typescript
import { register, login, requireAuth } from './domains/auth';
```

### 💰 Plaid Domain
**路径**: `src/domains/plaid/`

负责 Plaid 财务 API 集成：
```
plaid/
├── controllers/plaidController.ts
│   ├── createLinkToken()          # 创建 Plaid Link
│   ├── exchangePublicToken()      # 交换 Access Token
│   ├── getFinanceSnapshot()       # 获取财务数据
│   ├── disconnectPlaidAccount()   # 解除连接
│   └── updatePlaidAccountOrder()  # 更新账户排序
├── lib/plaid.ts                   # Plaid 客户端配置
└── index.ts                        # 导出接口
```

**导入示例**:
```typescript
import { getFinanceSnapshot, createLinkToken } from './domains/plaid';
```

### 📊 Logger Domain
**路径**: `src/domains/logger/`

负责日志系统：
```
logger/
├── logger.ts            # Winston 配置 + 全局错误处理
├── logger.util.ts       # 便捷日志函数
│   ├── logHttpRequest()
│   ├── logDatabaseOperation()
│   ├── logAuthEvent()
│   ├── logError()
│   ├── logPerformance()
│   ├── logBusinessEvent()
│   ├── logDebug()
│   └── logStartup()
├── logger.middleware.ts # Express 中间件
│   ├── httpLogger
│   ├── requestBodyLogger
│   └── errorLogger
└── index.ts             # 导出接口
```

**导入示例**:
```typescript
import { appLogger, logError, logDebug } from './domains/logger';
import { httpLogger, errorLogger } from './domains/logger';
```

### 🔧 Shared Domain
**路径**: `src/domains/shared/`

共享库和工具：
```
shared/
├── lib/prisma.ts   # Prisma 数据库连接
└── index.ts        # 导出接口
```

**导入示例**:
```typescript
import { prisma } from './domains/shared';
```

## 导入规则

### ✅ 推荐的导入方式
```typescript
// 从 domain 的 index.ts 导入公共接口
import { register, login } from './domains/auth';
import { appLogger } from './domains/logger';
import { prisma } from './domains/shared';
```

### ❌ 避免的导入方式
```typescript
// 直接导入内部文件
import authController from './domains/auth/controllers/authController';
import { logger } from './domains/logger/logger';
```

## 添加新 Domain

按照以下步骤添加新的业务域：

### 1. 创建目录结构
```bash
mkdir -p src/domains/my-domain/{controllers,lib,middleware,types}
```

### 2. 创建必要文件
```bash
# controllers 层
touch src/domains/my-domain/controllers/myController.ts

# lib 层（如需要）
touch src/domains/my-domain/lib/myHelper.ts

# middleware 层（如需要）
touch src/domains/my-domain/middleware/myMiddleware.ts

# types 层（如需要）
touch src/domains/my-domain/types/index.ts

# 导出接口
touch src/domains/my-domain/index.ts
```

### 3. 创建 index.ts 导出接口
```typescript
// src/domains/my-domain/index.ts
export { myController } from './controllers/myController';
export { myMiddleware } from './middleware/myMiddleware';
export type { MyType } from './types';
```

### 4. 在主 index.ts 使用
```typescript
import { myController } from './domains/my-domain';

app.post('/api/my-route', myController);
```

## 文件命名约定

| 文件类型 | 命名约定 | 示例 |
|---------|--------|------|
| Controller | 控制器名 + Controller | `authController.ts` |
| Middleware | 功能名 + 或 Middleware | `auth.ts` |
| Service/Lib | 功能名 | `plaid.ts`, `prisma.ts` |
| Type/Interface | 名称 | `types.ts`, `index.ts` |
| Utility | 功能名 + 或 utils | `logger.util.ts` |

## 文件大小限制建议

- 单个 controller 文件：< 500 行
- 单个 service/lib 文件：< 300 行
- 如果超出，考虑拆分为多个文件

示例：
```
plaid/
├── controllers/
│   ├── linkTokenController.ts      # Link Token 管理
│   ├── accountController.ts         # 账户管理
│   ├── transactionController.ts     # 交易管理
│   └── investmentController.ts      # 投资管理
├── lib/
│   ├── plaid.ts                    # API 配置
│   └── plaidMapper.ts              # 数据映射
└── index.ts
```

## 依赖关系

```
   ┌─────────────────────┐
   │   src/index.ts      │ (路由定义)
   └──────────┬──────────┘
              │
    ┌─────────┼──────────┐
    │         │          │
    ▼         ▼          ▼
  ┌────┐   ┌───────┐   ┌──────┐
  │ auth│   │ plaid │   │logger │
  └────┘   └───────┘   └──────┘
    │         │          │
    └────┬────┴──────┬──┘
         │           │
         ▼           ▼
     ┌───────┐ ┌────────────┐
     │shared │ │external libs│
     └───────┘ └────────────┘
```

- **auth**: 依赖 shared (prisma), logger
- **plaid**: 依赖 auth (AuthRequest), shared (prisma), logger
- **logger**: 独立（系统层）
- **shared**: 独立（基础库）

## 避免循环依赖

❌ 错误：
```typescript
// auth/index.ts
import { getFinanceSnapshot } from '../plaid';  // ❌ 不要这样

// plaid/index.ts
import { requireAuth } from '../auth';  // 导致循环依赖
```

✅ 正确：
```typescript
// 在主 index.ts 中协调依赖
import { requireAuth } from './domains/auth';
import { createLinkToken } from './domains/plaid';

app.post('/api/plaid/link-token', requireAuth, createLinkToken);
```

## Domain 间通信

### 通过 Request 对象
```typescript
// plaid controller 使用 auth 的 AuthRequest
import type { AuthRequest } from '../../auth/middleware/auth';

export const createLinkToken = async (req: AuthRequest, res: Response) => {
  const userId = req.userId;  // 来自 auth middleware
};
```

### 通过 Shared 库
```typescript
// 两个 domain 都需要的代码放在 shared
import { prisma } from '../../shared';

// 在 auth 中使用
const user = await prisma.user.findUnique({ ... });

// 在 plaid 中使用
const items = await prisma.plaidItem.findMany({ ... });
```

### 通过 Event 或 Callback（高级）
如果需要 domain 间的解耦通信，可以考虑事件系统：
```typescript
// shared/events/eventBus.ts
export const eventBus = new EventEmitter();

// auth 发出事件
eventBus.emit('user:registered', { userId });

// plaid 监听事件
eventBus.on('user:registered', ({ userId }) => {
  // 初始化用户的 plaid 设置
});
```

---

**更新时间**: 2026-04-08  
**架构模式**: Domain-Based (DDD)  
**维护者**: Kura Team
