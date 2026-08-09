"""User-facing errors raised by Herbert."""


class HerbertError(Exception):
    """Base class for errors that Herbert can explain to a user."""


class InputFileNotFoundError(HerbertError):
    """The requested input file does not exist."""


class UnsupportedFileTypeError(HerbertError):
    """The input is not a PDF file."""


class UnreadablePdfError(HerbertError):
    """The PDF is damaged, encrypted, or otherwise unreadable."""


class NoExtractableTextError(HerbertError):
    """The PDF contains no text Herbert can currently extract."""


class MissingApiKeyError(HerbertError):
    """The DeepSeek API key is not configured on this computer."""


class AIServiceError(HerbertError):
    """DeepSeek could not complete a request."""


class InvalidAIResponseError(HerbertError):
    """DeepSeek returned data that Herbert cannot safely interpret."""
