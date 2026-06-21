import pytest

from auth import USERNAME_RULE_MESSAGE, UserStore


def test_create_user_normalizes_username_and_login_is_case_insensitive(tmp_path):
    store = UserStore(db_dir=tmp_path)

    user = store.create_user(" GV001 ", "secret123")

    assert user["username"] == "gv001"
    assert store.verify_login("GV001", "secret123")["username"] == "gv001"


@pytest.mark.parametrize("username", ["gv_001", "gv+001", "nguyễn", "ab"])
def test_create_user_rejects_unsafe_usernames(tmp_path, username):
    store = UserStore(db_dir=tmp_path)

    with pytest.raises(ValueError, match=USERNAME_RULE_MESSAGE.split(" ")[0]):
        store.create_user(username, "secret123")


def test_ensure_admin_ignores_invalid_env_username(tmp_path):
    store = UserStore(db_dir=tmp_path)

    store.ensure_admin("admin_user", "secret123")

    assert store.count_users() == 0
