import { describe, it, expect } from 'vitest';
import { AsyncLocalStorage } from 'async_hooks';

/**
 * async_hooks 测试套件
 *
 * async_hooks 是 Node.js 提供的用于追踪异步资源生命周期的模块
 * AsyncLocalStorage 是其中最常用的 API，用于在异步调用链中传递上下文数据
 *
 * 主要用途：
 * 1. 请求追踪：在 HTTP 请求的整个生命周期中保持请求 ID、用户信息等上下文
 * 2. 日志关联：在异步操作中关联日志，无需手动传递参数
 * 3. 事务管理：在数据库事务中保持连接上下文
 * 4. 权限控制：在整个请求链中保持用户权限信息
 */

describe('AsyncLocalStorage 基础功能测试', () => {
    it('应该能在同步代码中存储和获取值', () => {
        // 创建一个 AsyncLocalStorage 实例
        const storage = new AsyncLocalStorage<string>();

        // 使用 run 方法设置上下文值
        storage.run('test-value', () => {
            // 在回调函数内部可以获取到存储的值
            const value = storage.getStore();
            expect(value).toBe('test-value');
        });

        // 在 run 方法外部无法获取到值
        const outsideValue = storage.getStore();
        expect(outsideValue).toBeUndefined();
    });

    it('应该能在异步代码中保持上下文', async () => {
        const storage = new AsyncLocalStorage<{ userId: string; requestId: string }>();

        await storage.run({ userId: 'user-123', requestId: 'req-456' }, async () => {
            // 模拟异步操作（如数据库查询）
            await new Promise(resolve => setTimeout(resolve, 10));

            // 即使经过异步操作，仍然能获取到上下文
            const context = storage.getStore();
            expect(context?.userId).toBe('user-123');
            expect(context?.requestId).toBe('req-456');

            // 在嵌套的异步操作中也能获取
            await new Promise(resolve => setTimeout(resolve, 10));
            const context2 = storage.getStore();
            expect(context2?.userId).toBe('user-123');
        });
    });

    it('应该支持嵌套的上下文', () => {
        const storage = new AsyncLocalStorage<number>();

        storage.run(1, () => {
            expect(storage.getStore()).toBe(1);

            // 嵌套的 run 会创建新的上下文
            storage.run(2, () => {
                expect(storage.getStore()).toBe(2);

                storage.run(3, () => {
                    expect(storage.getStore()).toBe(3);
                });

                // 退出内层上下文后，恢复到当前层的值
                expect(storage.getStore()).toBe(2);
            });

            // 退出嵌套后，恢复到最外层的值
            expect(storage.getStore()).toBe(1);
        });
    });
});

describe('AsyncLocalStorage 实际应用场景', () => {
    it('场景1: HTTP 请求追踪 - 模拟在整个请求链中保持请求上下文', async () => {
        // 创建请求上下文存储
        const requestContext = new AsyncLocalStorage<{
            requestId: string;
            userId: string;
            startTime: number;
        }>();

        // 模拟中间件：设置请求上下文
        const middleware = async (handler: () => Promise<void>) => {
            await requestContext.run(
                {
                    requestId: 'req-' + Math.random().toString(36).substr(2, 9),
                    userId: 'user-123',
                    startTime: Date.now(),
                },
                handler
            );
        };

        // 模拟日志函数：自动包含请求上下文
        const log = (message: string) => {
            const context = requestContext.getStore();
            return {
                message,
                requestId: context?.requestId,
                userId: context?.userId,
                timestamp: Date.now(),
            };
        };

        // 模拟业务逻辑
        const businessLogic = async () => {
            const log1 = log('开始处理请求');
            expect(log1.requestId).toBeDefined();
            expect(log1.userId).toBe('user-123');

            // 模拟数据库查询
            await new Promise(resolve => setTimeout(resolve, 10));
            const log2 = log('数据库查询完成');
            expect(log2.requestId).toBe(log1.requestId); // 同一个请求 ID

            // 模拟外部 API 调用
            await new Promise(resolve => setTimeout(resolve, 10));
            const log3 = log('API 调用完成');
            expect(log3.requestId).toBe(log1.requestId); // 仍然是同一个请求 ID
        };

        // 执行请求
        await middleware(businessLogic);
    });

    it('场景2: 数据库事务管理 - 在事务中保持数据库连接', async () => {
        // 模拟数据库连接
        class DatabaseConnection {
            constructor(public id: string) { }
            async query(sql: string) {
                return { sql, connectionId: this.id };
            }
        }

        // 创建连接存储
        const connectionStorage = new AsyncLocalStorage<DatabaseConnection>();

        // 模拟事务管理器
        const withTransaction = async <T>(callback: () => Promise<T>): Promise<T> => {
            const connection = new DatabaseConnection('conn-' + Math.random().toString(36).substr(2, 9));
            return await connectionStorage.run(connection, async () => {
                try {
                    const result = await callback();
                    // 模拟提交事务
                    await connection.query('COMMIT');
                    return result;
                } catch (error) {
                    // 模拟回滚事务
                    await connection.query('ROLLBACK');
                    throw error;
                }
            });
        };

        // 模拟 DAO 层：自动使用当前事务的连接
        const userDao = {
            async findById(id: string) {
                const conn = connectionStorage.getStore();
                if (!conn) throw new Error('No active transaction');
                return await conn.query(`SELECT * FROM users WHERE id = '${id}'`);
            },
            async update(id: string, data: any) {
                const conn = connectionStorage.getStore();
                if (!conn) throw new Error('No active transaction');
                return await conn.query(`UPDATE users SET data = '${JSON.stringify(data)}' WHERE id = '${id}'`);
            },
        };

        // 使用事务
        const result = await withTransaction(async () => {
            const user = await userDao.findById('user-123');
            const updated = await userDao.update('user-123', { name: 'New Name' });

            // 两次查询使用的是同一个连接
            expect(user.connectionId).toBe(updated.connectionId);

            return updated;
        });

        expect(result.sql).toContain('UPDATE');
    });

    it('场景3: 权限控制 - 在整个调用链中保持用户权限', async () => {
        // 定义用户权限类型
        interface UserPermissions {
            userId: string;
            roles: string[];
            permissions: string[];
        }

        // 创建权限上下文存储
        const permissionContext = new AsyncLocalStorage<UserPermissions>();

        // 权限检查函数
        const requirePermission = (permission: string) => {
            const context = permissionContext.getStore();
            if (!context) {
                throw new Error('未找到权限上下文');
            }
            if (!context.permissions.includes(permission)) {
                throw new Error(`缺少权限: ${permission}`);
            }
        };

        // 获取当前用户
        const getCurrentUser = () => {
            const context = permissionContext.getStore();
            if (!context) throw new Error('未找到用户上下文');
            return context;
        };

        // 模拟服务层
        const userService = {
            async deleteUser(userId: string) {
                requirePermission('user:delete'); // 自动检查权限
                const currentUser = getCurrentUser();
                return { deleted: userId, by: currentUser.userId };
            },
            async viewUser(userId: string) {
                requirePermission('user:read'); // 自动检查权限
                return { userId };
            },
        };

        // 测试：有权限的用户
        await permissionContext.run(
            {
                userId: 'admin-001',
                roles: ['admin'],
                permissions: ['user:read', 'user:write', 'user:delete'],
            },
            async () => {
                const result = await userService.deleteUser('user-123');
                expect(result.deleted).toBe('user-123');
                expect(result.by).toBe('admin-001');
            }
        );

        // 测试：无权限的用户
        await expect(
            permissionContext.run(
                {
                    userId: 'user-002',
                    roles: ['user'],
                    permissions: ['user:read'], // 只有读权限
                },
                async () => {
                    await userService.deleteUser('user-123'); // 尝试删除会失败
                }
            )
        ).rejects.toThrow('缺少权限: user:delete');
    });
});

describe('AsyncLocalStorage 多实例隔离', () => {
    it('不同的 AsyncLocalStorage 实例之间互不影响', () => {
        const storage1 = new AsyncLocalStorage<string>();
        const storage2 = new AsyncLocalStorage<number>();

        storage1.run('string-value', () => {
            storage2.run(42, () => {
                // 两个存储互不影响
                expect(storage1.getStore()).toBe('string-value');
                expect(storage2.getStore()).toBe(42);
            });

            // storage2 的上下文已退出
            expect(storage1.getStore()).toBe('string-value');
            expect(storage2.getStore()).toBeUndefined();
        });
    });

    it('并发请求之间的上下文隔离', async () => {
        const storage = new AsyncLocalStorage<{ id: number }>();
        const results: number[] = [];

        // 模拟 3 个并发请求
        const requests = [1, 2, 3].map(id =>
            storage.run({ id }, async () => {
                // 模拟异步操作
                await new Promise(resolve => setTimeout(resolve, Math.random() * 20));

                // 每个请求都能正确获取自己的 ID
                const context = storage.getStore();
                results.push(context!.id);

                // 再次异步操作
                await new Promise(resolve => setTimeout(resolve, Math.random() * 20));

                // 仍然是正确的 ID
                const context2 = storage.getStore();
                expect(context2!.id).toBe(id);
            })
        );

        await Promise.all(requests);

        // 所有请求都正确执行
        expect(results.sort()).toEqual([1, 2, 3]);
    });
});

describe('AsyncLocalStorage测试', () => {
    const storage = new AsyncLocalStorage<string>();
    it('test', async () => {
        await storage.run('test-value', () => { })
        const s = storage.getStore();
        expect(s).toBe("test-value")
        storage.run('another-value', () => { })
        const s2 = storage.getStore();
        expect(s2).toBe("another-value")
    })
})
/**
 * 总结：
 *
 * AsyncLocalStorage 的核心价值：
 * 1. 无需手动传递参数：在异步调用链中自动传递上下文
 * 2. 代码解耦：业务逻辑不需要关心上下文如何传递
 * 3. 并发安全：不同的异步操作之间完全隔离
 * 4. 性能优秀：基于 V8 引擎的原生实现，性能开销很小
 *
 * 适用场景：
 * - Web 框架中的请求追踪（Express、Koa、Fastify 等）
 * - 日志系统中的上下文关联
 * - 数据库事务管理
 * - 权限和认证系统
 * - 分布式追踪（OpenTelemetry）
 * - 任何需要在异步调用链中传递上下文的场景
 */
