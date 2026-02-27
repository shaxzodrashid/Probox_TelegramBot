start_message =
    Assalomu alaykum! Probox kompaniyasining rasmiy servis botiga xush kelibsiz. Davom etish uchun, iltimos, o'zingizga qulay tilni tanlang 👇

    Здравствуйте! Вас приветствует официальный сервис-бот компании Probox. Для продолжения работы, пожалуйста, выберите предпочитаемый язык 👇
welcome_message = Добро пожаловать! Выберите нужный раздел.👇
help_message = Вот текст справки. Нажмите "Назад", чтобы вернуться в главное меню.
about_message = Данный сервис-бот разработан специально для клиентов компании Probox. С его помощью вы можете удобно управлять своими контрактами, отслеживать платежи и получать оперативную поддержку.
back_button = Назад
help_button = Помощь
about_button = О боте
uz_button = 🇺🇿 O'zbekcha
ru_button = 🇷🇺 Русский
share_phone_button = 📱 Отправить номер телефона
ask_phone = Для продолжения, пожалуйста, отправьте свой номер телефона.
phone_saved = Спасибо! Ваш номер телефона сохранен.
otp_sent = Код подтверждения отправлен на ваш номер телефона.
otp_sent_wait = Код подтверждения отправлен на ваш номер телефона. Если код не пришел, через 1 минуту появится кнопка для повторной отправки.
invalid_otp = Неверный код или срок действия кода истек. Пожалуйста, попробуйте еще раз.
resend_otp_button = 🔄 Отправить код еще раз
otp_resend_info = Код не пришел? Вы можете отправить его повторно.
ask_otp = Пожалуйста, введите 6-значный код подтверждения:
menu_contracts = 📄 Мои контракты
menu_payments = 💳 Мои платежи
menu_settings = ⚙️ Настройки
menu_support = 📞 Поддержка
menu_application = ✍️ Оставить заявку
menu_application_placeholder = 🚧 Раздел подачи заявок скоро будет запущен!
application_passport_required = ⚠️ Для подачи заявки требуются паспортные данные.
application_start_passport_button = 🪪 Ввести паспортные данные
application_success = ✅ Ваша заявка успешно принята!
application_error = ❌ Произошла ошибка при отправке заявки. Пожалуйста, попробуйте позже.
application_ask_first_name = 👤 Пожалуйста, введите ваше имя и фамилию:
application_first_name_saved = ✅ Спасибо! Ваше имя сохранено.
back = 🔙 Назад

# Contracts
contracts_header = 📄 *Ваши контракты*
contracts_page_info = 📋 Всего: { $total } контрактов | Страница: { $current }/{ $pages }
contracts_total = 📋 Всего: { $total } контрактов
contracts_download = 📥 Скачать
contracts_coming_soon = 🚧 Функция загрузки PDF скоро будет добавлена!
contracts_not_found = На данный момент у вас нет активных контрактов. 😊
contracts_no_access = ⚠️ У вас пока нет покупок. После того, как вы совершите покупку в Probox, ваши контракты появятся здесь.
contracts_error = ❌ Произошла ошибка при загрузке контрактов.
contracts_not_found_alert = ❌ Контракт не найден.
contracts_back_to_menu = 🔙 В меню
contracts_detail_header = 📄 *ИНФОРМАЦИЯ О КОНТРАКТЕ*
contracts_partner_label = 👤 *Партнер:* { $name }
contracts_product_label = 🛠 *Товар:* { $name }
contracts_number_label = 🔢 *Номер контракта:* `{ $number }`
contracts_purchase_date_label = 📅 *Дата покупки:* { $date }
contracts_due_date_label = 🏁 *Дата окончания:* { $date }
contracts_total_amount_label = 💰 *Сумма контракта:* { $amount }
contracts_paid_label = ✅ *Оплачено:* { $amount }
contracts_next_payment_label = ⏳ *Следующий платеж:*
contracts_date_label = 📅 *Дата:* { $date }
contracts_amount_label = 💵 *Сумма:* { $amount }
contracts_payment_note_paid = ⚠️ *Примечание:* Из этого платежа оплачено { $paid }. Остаток: { $remaining }
contracts_payment_note_unpaid = ⚠️ *Примечание:* Этот платеж еще не произведен.
contracts_all_paid = 🎉 *Поздравляем!* Все платежи произведены.
contracts_download_pdf = 📄 PDF загрузить

# Payments
payments_header = 💳 *Ваши платежи*
payments_total = 📋 Всего: { $total } контрактов
payments_not_found = На данный момент у вас нет активных платежей. 😊
payments_no_access = ⚠️ У вас пока нет покупок. После того, как вы совершите покупку в Probox, здесь появится вся информация.
payments_error = ❌ Произошла ошибка при загрузке платежей.
payments_detail_header = 💳 ИНФОРМАЦИЯ О ПЛАТЕЖЕ
payments_contract_label = 🔢 Контракт: { $number }
payments_products_label = 📦 Товары:
payments_doc_date_label = 📅 Дата контракта: { $date }
payments_due_date_label = 🏁 Дата окончания: { $date }
payments_total_label = 💰 Общая сумма: { $amount }
payments_paid_label = ✅ Оплачено: { $amount }
payments_remaining_label = ⚠️ Остаток: { $amount }
payments_schedule_label = 📋 График платежей:
payments_not_found_alert = ❌ Платеж не найден.
payments_main_menu = Главное меню

# Settings
settings_header = ⚙️ <b>Настройки</b>
    
    👤 <b>Имя:</b> { $first_name } { $last_name }
    📱 <b>Тел:</b> { $phone }
    🌐 <b>Язык:</b> { $language }
    🪪 <b>Паспорт:</b> <tg-spoiler>{ $passport_series }</tg-spoiler>
    🔢 <b>ПИНФЛ (JShShIR):</b> <tg-spoiler>{ $jshshir }</tg-spoiler>
    
    Выберите нужный раздел:
settings_select_language = Пожалуйста, выберите предпочитаемый язык 👇
settings_change_name = 👤 Изменить имя
settings_change_phone = 📱 Изменить номер
settings_change_language = 🌐 Изменить язык
settings_add_passport = 🪪 Паспортные данные
settings_add_passport_method = Как вы хотите сохранить паспортные данные?
settings_passport_method_photo = 📸 Загрузить фото
settings_passport_method_manual = ✍️ Ввести вручную
settings_passport_prompt_front = Пожалуйста, отправьте фото лицевой части ID-карты или паспорта, как показано на примере.
settings_passport_prompt_back = Теперь, пожалуйста, отправьте фото обратной стороны ID-карты. (Если у вас паспорт, можете отправить то же фото еще раз)
settings_passport_error = ❌ Извините, не удалось прочитать данные с фотографий. Пожалуйста, сделайте более четкое фото при хорошем освещении и попробуйте снова.
settings_passport_success = ✅ Ваши данные успешно сохранены!
settings_passport_processing = ⏳ Проверка фотографий, пожалуйста, подождите...
settings_passport_enter_series = 🔢 Пожалуйста, введите серию и номер паспорта (например, AB1234567):
settings_passport_invalid_series = ❌ Неверная серия паспорта. Она должна состоять из 2 букв и 7 цифр. Пожалуйста, введите снова:
settings_passport_enter_jshshir = 🔢 Пожалуйста, введите ваш 14-значный номер ПИНФЛ (JShShIR):
settings_passport_invalid_jshshir = ❌ Неверный формат. ПИНФЛ должен состоять ровно из 14 цифр. Пожалуйста, введите снова:
settings_passport_confirm_data = 📄 *Подтверждение данных*
    
    🔢 *Серия паспорта:* { $series }
    🔢 *ПИНФЛ (JShShIR):* { $jshshir }
    
    ✅ Все верно?
settings_passport_missing_data = ⚠️ Приносим извинения, нам не удалось полностью прочитать данные с фото. Пожалуйста, введите недостающие данные вручную.
settings_passport_edit_series = ✏️ Изменить серию и номер
settings_passport_edit_jshshir = ✏️ Изменить ПИНФЛ
settings_passport_confirm_btn = ✅ Подтвердить
settings_passport_use_buttons = ⚠️ Пожалуйста, выберите одну из кнопок ниже.
settings_passport_save_error = ❌ Не удалось сохранить данные. Пожалуйста, попробуйте позже.
settings_enter_first_name = Пожалуйста, введите ваше новое имя:
settings_enter_last_name = Пожалуйста, введите вашу новую фамилию:
settings_enter_phone = Пожалуйста, введите новый номер телефона (+998XXXXXXXXX):
settings_name_updated = ✅ Ваше имя успешно изменено!
settings_phone_updated = ✅ Ваш номер телефона успешно изменен!


# Registration Prompt
registration_required = ⚠️ Для доступа к этому разделу необходимо зарегистрироваться. Нажмите кнопку ниже для регистрации.
registration_button = 📝 Зарегистрироваться
registration_incomplete = ⚠️ Вы не завершили регистрацию. Для продолжения укажите свой номер телефона в настройках.
registration_incomplete_button = ⚙️ Настройки

# Support
support_header = 📞 Поддержка
support_ask_message = Пожалуйста, опишите вашу проблему. Вы можете отправить текст или фото.
support_sent = ✅ Ваше обращение принято. Мы скоро ответим!
support_banned = 🚫 Вам запрещено использовать службу поддержки.
support_cancel = 🔙 Отмена
support_not_registered = ⚠️ Пожалуйста, сначала зарегистрируйтесь.
support_error = ❌ Произошла ошибка. Пожалуйста, попробуйте позже.
support_reply_received = 📩 Ответ на ваше обращение *#{ $ticket }*:

# Admin Support
admin_ticket_reply = ✏️ Ответить
admin_ticket_close = ✅ Закрыть
admin_ticket_block = 🚫 Заблокировать
admin_another_replying = ⚠️ Другой администратор уже отвечает. Пожалуйста, подождите.
admin_reply_sent = ✅ Ответ успешно отправлен!
admin_already_replied = ℹ️ На это обращение уже ответили.
admin_lock_expired = ⏰ Время истекло. Пожалуйста, попробуйте снова.
admin_reply_ask_message = 💬 Напишите ваш ответ (текст или фото):
admin_reply_cancel = 🔙 Отмена
admin_ticket_closed = ✅ Обращение закрыто.
admin_ticket_not_found = ❌ Обращение не найдено.
admin_user_blocked = 🚫 Пользователь заблокирован от поддержки.
admin_user_unblocked = ✅ Пользователь разблокирован.
admin_view_reply = 📜 Посмотреть ответ
admin_replied_header = ✅ ОТВЕТ ОТПРАВЛЕН
admin_replied_by = Ответил: { $admin }
admin_replied_at = 🕐 { $date }
admin_error_generic = ❌ Произошла ошибка. Пожалуйста, попробуйте снова.
admin_reply_cancelled = ❌ Ответ отменён.
admin_user_has_blocked_bot = ⚠️ Пользователь заблокировал бота. Сообщение не доставлено, но обращение помечено как отвеченное.
admin_new_ticket = 📩 Новое обращение #{ $ticket }
admin_ticket_replied_title = 📩 Обращение #{ $ticket } ✅ ОТВЕТ ОТПРАВЛЕН
admin_replied_at_full = ✅ Ответил: { $admin }\n   🕐 { $date }

# Admin Panel
admin_menu = 👨‍💼 Админ панель
admin_menu_header = 👨‍💼 *Админ Панель*
    
    Выберите нужный раздел:
admin_users = 👥 Пользователи
admin_broadcast = 📢 Отправить сообщение
admin_stats = 📊 Статистика
admin_export = 📥 Скачать Excel
back_to_user_menu = 👤 Меню пользователя
admin_cancel = ❌ Отмена

# Admin Users
admin_users_header = 👥 *Список пользователей*
admin_users_footer = 📄 Страница: { $current }/{ $total } | Всего: { $count }
admin_user_not_found = ❌ Пользователь не найден.
admin_user_detail_header = 👤 *Данные пользователя*
admin_phone = Телефон
admin_language = Язык
admin_is_admin = Админ
admin_support_banned = Заблокирован
admin_registered = Зарегистрирован
admin_block_support = 🚫 Заблокировать
admin_unblock_support = ✅ Разблокировать
admin_send_message = 📤 Отправить сообщение
admin_action_failed = ❌ Действие не выполнено.
admin_access_denied = ⛔ Доступ запрещен
admin_user_name = Имя
admin_unknown_user = Неизвестно
admin_no = Нет
admin_yes = Да

# Admin Statistics
admin_stats_header = 📊 *Статистика*
admin_stats_users = Пользователи
admin_stats_tickets = Обращения
admin_stats_total = Всего
admin_stats_admins = Админы
admin_stats_with_sap = С SAP
admin_stats_support_banned = Заблокировано
admin_stats_open = Открыто
admin_stats_replied = Отвечено
admin_stats_closed = Закрыто

# Admin Export
admin_export_generating = ⏳ Создание Excel файла...
admin_export_ready = ✅ Отчет готов!
admin_export_error = ❌ Ошибка при создании отчета.
admin_export_rate_limit = ⏳ Пожалуйста, подождите { $minutes } минут.

# Admin Broadcast
admin_broadcast_select_target = Кому вы хотите отправить сообщение?
admin_broadcast_all = 👥 Всем пользователям
admin_broadcast_single = 👤 Одному пользователю
admin_broadcast_enter_user = 👤 Введите ID пользователя или номер телефона:
admin_broadcast_enter_user_prompt = Введите Telegram ID или номер телефона:
admin_broadcast_enter_message = 💬 Напишите сообщение (текст или фото):
admin_broadcast_invalid_message = ❌ Сообщение не может быть пустым.
admin_broadcast_confirm = Отправить сообщение { $count } пользователям?
admin_broadcast_confirm_single = Отправить сообщение { $count } пользователю?
admin_confirm_yes = ✅ Да
admin_confirm_no = ❌ Нет
admin_broadcast_started = 🚀 Рассылка начата...
admin_broadcast_processing = ⏳ Отправка сообщений { $count } пользователям...
admin_broadcast_complete = ✅ Завершено: { $success }/{ $total }
admin_broadcast_sent = ✅ Сообщение отправлено!
admin_broadcast_failed = ❌ Ошибка при отправке сообщения.
admin_broadcast_error = ❌ Произошла ошибка.
admin_broadcast_already_in_progress = ⚠️ В данный момент выполняется другая рассылка. Пожалуйста, подождите.
admin_cancelled = ❌ Отменено.

# Admin Search
admin_search_prompt = 🔍 Введите имя или номер телефона для поиска:
admin_search_no_results = ❌ По запросу "{ $query }" ничего не найдено.
admin_search_results = 🔍 Результаты поиска: "{ $query }"

# Admin Send Message
admin_send_enter_message = 💬 Напишите сообщение (текст или фото):
admin_send_invalid_message = ❌ Сообщение не может быть пустым.
admin_send_success = ✅ Сообщение отправлено!
admin_send_failed = ❌ Ошибка при отправке сообщения.
admin_error = ❌ Произошла ошибка.

# Logout/Login
menu_logout = 🚪 Выход
menu_login = 📝 Войти / Регистрация
logout_success = ✅ Вы успешно вышли. Для повторного входа нажмите "Войти / Регистрация".

