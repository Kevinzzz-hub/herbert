"""Tests for the DeepSeek JSON client without making network requests."""

from types import SimpleNamespace

import pytest

from herbert.deepseek import DeepSeekJsonClient
from herbert.errors import InvalidAIResponseError, MissingApiKeyError


class FakeCompletions:
    def __init__(self, content: str) -> None:
        self.content = content
        self.requests: list[dict] = []

    def create(self, **kwargs):
        self.requests.append(kwargs)
        message = SimpleNamespace(content=self.content)
        return SimpleNamespace(choices=[SimpleNamespace(message=message)])


def fake_sdk(content: str):
    completions = FakeCompletions(content)
    sdk = SimpleNamespace(chat=SimpleNamespace(completions=completions))
    return sdk, completions


def test_client_requests_json_from_selected_model() -> None:
    sdk, completions = fake_sdk('{"overview": "Useful"}')
    client = DeepSeekJsonClient(
        api_key="test-only-key",
        model="deepseek-v4-flash",
        sdk_client=sdk,
    )

    result = client.complete_json(system_prompt="System", user_prompt="User")

    assert result == {"overview": "Useful"}
    request = completions.requests[0]
    assert request["model"] == "deepseek-v4-flash"
    assert request["response_format"] == {"type": "json_object"}
    assert request["messages"][1] == {"role": "user", "content": "User"}


@pytest.mark.parametrize("content", ["", "not-json", "[]"])
def test_client_rejects_unusable_json(content: str) -> None:
    sdk, _ = fake_sdk(content)
    client = DeepSeekJsonClient(api_key="test-only-key", sdk_client=sdk)

    with pytest.raises(InvalidAIResponseError):
        client.complete_json(system_prompt="System", user_prompt="User")


def test_environment_requires_a_private_key(monkeypatch) -> None:
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    monkeypatch.setattr("herbert.deepseek.load_dotenv", lambda: False)

    with pytest.raises(MissingApiKeyError, match="DEEPSEEK_API_KEY"):
        DeepSeekJsonClient.from_environment()
