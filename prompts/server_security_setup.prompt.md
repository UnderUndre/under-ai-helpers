# Server Security Setup — Полный Runbook

Миграция с root на deploy-юзера, настройка деплоя и дебага.

---

## Шаг 0: Бэкап

```bash
./scripts/prod-exec.sh backup
```

---

## Шаг 1: Создать deploy-юзера

```bash
# Запускается с ТВОЕГО компа. Подключается как root, создаёт юзера.
./scripts/setup-deploy-user.sh root@<IP>

# Или через SSH-алиас (если уже настроен, например prod → root@<IP>):
./scripts/setup-deploy-user.sh prod

# С кастомным именем юзера:
DEPLOY_USER=deploy_user ./scripts/setup-deploy-user.sh prod
```

Скрипт делает:

1. Создаёт юзера с sudo + docker
2. SSH-ключи:
   - **Есть у root** → копирует authorized_keys + приватные ключи + config
   - **Нет у root** → генерирует новый ed25519 ключ, печатает публичный (добавь в GitHub Deploy Keys)
   - Если нет authorized_keys → подсказывает `ssh-copy-id` с локальной машины
3. Тестит SSH-доступ нового юзера + доступ к GitHub (для `git fetch`)
4. Копирует проект из `/root/` в `/home/<user>/` (если есть)
5. Ставит NVM + Node.js (нужен для `npm run` команд на хосте)
6. Опционально отключает root SSH (спросит подтверждение)

**ВАЖНО**: НЕ отключай root пока не проверил ВСЁ ниже. Скрипт спросит.

---

## Шаг 2: Обновить SSH конфиг (на локальной машине)

```bash
./scripts/setup-ssh.sh
# Или руками — добавь в ~/.ssh/config:
# Host prod
#     HostName <IP>
#     User deploy
#     IdentityFile ~/.ssh/id_ed25519
```

---

## Шаг 3: Проверить базовый доступ

```bash
# 1. SSH под deploy
ssh prod "whoami"                     # → deploy

# 2. Docker без sudo
ssh prod "docker ps"                  # → контейнеры

# 3. Prod-exec скрипты
./scripts/prod-exec.sh logs 5         # → логи
./scripts/prod-exec.sh sql "SELECT 1" # → SQL
```

---

## Шаг 4: Проверить git fetch (критично для деплоя!)

```bash
# Сервер должен мочь тянуть код с GitHub
ssh prod "cd ~/repo-dir && git fetch origin main"
```

Если ошибка `Permission denied (publickey)`:

```bash
# Проверь, есть ли ключ
ssh prod "ls -la ~/.ssh/"

# Тест GitHub SSH
ssh prod "ssh -T git@github.com"

# Если ключа нет — скопируй руками с рута (если root ещё доступен):
ssh root@<IP> "cp /root/.ssh/id_ed25519* /home/deploy/.ssh/ && chown deploy:deploy /home/deploy/.ssh/id_ed25519*"

# Или создай deploy key на GitHub:
# 1. ssh prod "ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -C deploy@prod"
# 2. ssh prod "cat ~/.ssh/id_ed25519.pub"
# 3. GitHub → Repo → Settings → Deploy keys → Add (read-only)
```

---

## Шаг 5: Проверить полный деплой

```bash
# Полный тест-деплой
./scripts/deploy.sh

# Или только серверную часть:
ssh prod "cd ~/repo-dir && chmod +x scripts/server-deploy-prod.sh && scripts/server-deploy-prod.sh"

# Следить за логами:
./scripts/deploy-logs.sh
```

Что проверяется:

- `git fetch origin main` — тянет код
- `docker compose build` — собирает образ
- Blue-green swap — переключает контейнер
- Healthcheck — `/api/health` отвечает
- `npm run db:push` — мигрирует схему

---

## Шаг 6: Обновить GitHub Actions secrets

Если используешь CD workflow (`.github/workflows/deploy.yml`), обнови секреты:

| Secret        | Старое значение          | Новое значение                      |
| ------------- | ------------------------ | ----------------------------------- |
| `VPS_USER`    | `root`                   | `deploy`                            |
| `VPS_HOST`    | (без изменений)          | (без изменений)                     |
| `VPS_PATH`    | `/root/ai-digital-twins` | `/home/deploy/ai-digital-twins`     |
| `VPS_SSH_KEY` | (проверь — тот же ключ?) | (тот же, если ключ от local машины) |

```
GitHub → Repo → Settings → Secrets and variables → Actions → обнови
```

---

## Шаг 7: Создать AI readonly DB юзера

```bash
./scripts/prod-exec.sh setup-ai-user
# Скрипт создаст юзера, покажет пароль. СОХРАНИ ЕГО.
```

Проверить:

```bash
./scripts/prod-exec.sh ai-sql "SELECT count(*) FROM assistants;"  # ✅
./scripts/prod-exec.sh ai-sql "DROP TABLE assistants;"            # ❌ permission denied
```

---

## Шаг 8: Обновить .env.production на сервере

```bash
./scripts/prod-exec.sh sh "echo 'AI_READONLY_PASSWORD=<пароль>' >> ~/repo-dir/.env.production"
```

---

## Шаг 9 (опционально): Отключить root SSH

Если не сделал на шаге 1:

```bash
ssh prod "sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config && sudo systemctl restart sshd"
```

---

## Дебаг на проде

### Логи приложения

```bash
./scripts/prod-exec.sh logs 100         # последние 100 строк
./scripts/prod-exec.sh logs 500         # больше контекста
ssh prod "docker logs -f repo-name-app-prod"  # живой tail
```

### Логи конкретного контейнера

```bash
ssh prod "docker logs --tail 50 repo-name-db-prod"      # БД
ssh prod "docker logs --tail 50 repo-name-nginx-prod"    # Nginx
ssh prod "docker logs --tail 50 repo-name-redis"         # Redis
```

### SQL на проде

```bash
./scripts/prod-exec.sh sql "SELECT count(*) FROM users;"     # admin
./scripts/prod-exec.sh ai-sql "SELECT count(*) FROM users;"  # readonly
```

### Docker статус

```bash
ssh prod "docker ps"                     # запущенные контейнеры
ssh prod "docker ps -a"                  # + остановленные
ssh prod "docker stats --no-stream"      # CPU/RAM/Net
ssh prod "docker compose -f repo-dir/docker-compose.prod.yml ps"
```

### Ресурсы сервера

```bash
ssh prod "free -h"                # RAM
ssh prod "df -h"                  # Диск
ssh prod "docker system df"       # Docker-мусор
ssh prod "docker image prune -a"  # Почистить образы (осторожно)
```

### Рестарт контейнеров

```bash
# Рестартнуть приложение (без ребилда):
./scripts/restart-prod.sh

# Рестартнуть конкретный сервис:
ssh prod "cd ~/repo-dir && docker compose -f docker-compose.prod.yml restart app"
ssh prod "cd ~/repo-dir && docker compose -f docker-compose.prod.yml restart nginx"
```

### Зайти внутрь контейнера

```bash
ssh prod "docker exec -it repo-name-app-prod sh"   # app shell
ssh prod "docker exec -it repo-name-db-prod psql -U admin -d repo-name"  # psql
```

---

## Чеклист (после всего)

- [ ] `ssh prod "whoami"` → `deploy` (не root)
- [ ] `ssh prod "docker ps"` → контейнеры видны
- [ ] `ssh prod "cd ~/repo-dir && git fetch origin main"` → OK
- [ ] `./scripts/deploy.sh` → полный деплой проходит
- [ ] `./scripts/prod-exec.sh sql "SELECT 1"` → работает
- [ ] `./scripts/prod-exec.sh ai-sql "SELECT 1"` → работает
- [ ] `./scripts/prod-exec.sh ai-sql "DELETE FROM users"` → permission denied
- [ ] AI_READONLY_PASSWORD в .env.production
- [ ] GitHub Actions secrets обновлены (VPS_USER, VPS_PATH)
- [ ] `ssh root@<IP>` → отказывает в доступе (если отключил root)

---

## Откат (если всё сломалось)

Если залочил себя — обращайся в панель хостера (VNC/web-console).

```bash
# Через VNC/console хостера:
sed -i 's/PermitRootLogin no/PermitRootLogin yes/' /etc/ssh/sshd_config
systemctl restart sshd
```

Если деплой сломался:

```bash
# На сервере — откатить на предыдущий образ:
ssh prod "docker ps -a"  # найди старый контейнер
ssh prod "docker start <old_container_id>"
ssh prod "docker restart repo-name-nginx-prod"
```
