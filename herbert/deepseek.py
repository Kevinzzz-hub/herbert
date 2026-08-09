"""DeepSeek client configured for structured JSON responses."""

import json
import os
from typing import Any

from dotenv import load_dotenv
from openai import APIConnectionError, APIStatusError, OpenAI, OpenAIError

from herbert.errors import (
    AIServiceError,
    InvalidAIResponseError,
    MissingApiKeyError,
)

DEEPSEEK_BASE_URL = "https://api.deepseek.com"
DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash"


class DeepSeekJsonClient:
    """Send prompts to DeepSeek and return decoded JSON objects."""

    def __init__(
        self,
        *,
        api_key: str,
        model: str = DEFAULT_DEEPSEEK_MODEL,
        sdk_client: Any | None = None,
    ) -> None:
        if not api_key.strip():
            raise MissingApiKeyError(
                "没有找到 DEEPSEEK_API_KEY，请先在本机 .env 文件中配置。"
            )
        self.model = model
        self._client = sdk_client or OpenAI(
            api_key=api_key,
            base_url=DEEPSEEK_BASE_URL,
            timeout=120.0,
        )

    @classmethod
    def from_environment(cls, *, model: str | None = None) -> "DeepSeekJsonClient":
        """Load a private key from .env or the process environment."""

        load_dotenv()
        api_key = os.getenv("DEEPSEEK_API_KEY", "")
        selected_model = model or os.getenv(
            "DEEPSEEK_MODEL", DEFAULT_DEEPSEEK_MODEL
        )
        return cls(api_key=api_key, model=selected_model)

    def complete_json(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
    ) -> dict[str, Any]:
        """Request one JSON object and translate provider errors for the user."""

        try:
            response = self._client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                response_format={"type": "json_object"},
                temperature=0.2,
                max_tokens=4096,
            )
        except APIStatusError as exc:
            raise AIServiceError(
                f"DeepSeek 请求失败（HTTP {exc.status_code}），请稍后重试。"
            ) from exc
        except APIConnectionError as exc:
            raise AIServiceError(
                "无法连接 DeepSeek，请检查网络后重试。"
            ) from exc
        except OpenAIError as exc:
            raise AIServiceError("DeepSeek 暂时无法完成请求，请稍后重试。") from exc

        if not response.choices:
            raise InvalidAIResponseError("DeepSeek 没有返回可用的总结内容。")

        content = response.choices[0].message.content
        if not isinstance(content, str) or not content.strip():
            raise InvalidAIResponseError("DeepSeek 返回了空内容，请重新尝试。")

        try:
            payload = json.loads(content)
        except json.JSONDecodeError as exc:
            raise InvalidAIResponseError(
                "DeepSeek 返回的总结格式不完整，请重新尝试。"
            ) from exc

        if not isinstance(payload, dict):
            raise InvalidAIResponseError("DeepSeek 返回的内容不是 JSON 对象。")
        return payload
