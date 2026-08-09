"""Interprete LLM: convierte una secuencia de senas detectadas (glosas, en el
orden en que las produce el detector DTW/LSM) en una oracion natural y
gramaticalmente correcta en espanol, usando la API de OpenAI.

La Lengua de Senas Mexicana (LSM) no sigue el mismo orden ni conjugacion que
el espanol hablado (sin articulos, sin conjugaciones, orden libre). Este
script recibe la lista de glosas tal como las reconoce `dynamic_sign_detector`
(por ejemplo: ["YO", "QUERER", "PEDIR", "CAFE", "POR_FAVOR"]) y devuelve una
frase fluida (por ejemplo: "Quiero pedir un cafe, por favor.").

Uso:
    python interprete_llm.py YO QUERER PEDIR CAFE POR_FAVOR
    python interprete_llm.py --stdin   # lee glosas separadas por espacio de stdin
    echo "YO QUERER PEDIR CAFE POR_FAVOR" | python interprete_llm.py --stdin

Requiere la variable de entorno OPENAI_API_KEY. Si no esta configurada, se
devuelve la union simple de las glosas sin llamar a la API (fallback).

No agrega dependencias nuevas: usa unicamente la libreria estandar
(urllib.request) para no requerir instalar el paquete `openai`.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

OPENAI_URL = "https://api.openai.com/v1/chat/completions"
DEFAULT_MODEL = "gpt-4o-mini"

SYSTEM_PROMPT = (
    "Eres un interprete de Lengua de Senas Mexicana (LSM) a espanol hablado. "
    "El usuario te da una secuencia de glosas (palabras clave) tal como fueron "
    "detectadas por un sistema de reconocimiento de senas, en el orden en que "
    "la persona las hizo. La LSM no usa articulos, conjugaciones ni el mismo "
    "orden que el espanol. Tu tarea es producir UNA sola oracion en espanol "
    "natural, gramaticalmente correcta y fluida, que represente fielmente el "
    "significado de esas glosas, sin agregar informacion que no este implicita "
    "en ellas. Responde SOLO con la oracion final, sin comillas ni explicaciones."
)


class InterpreteLLMError(RuntimeError):
    """Error al llamar a la API de OpenAI para interpretar las glosas."""


def interpret_signs(
    glosses: list[str],
    api_key: str | None = None,
    model: str = DEFAULT_MODEL,
    timeout: float = 15.0,
) -> str:
    """Convierte una lista de glosas de senas en una oracion natural en espanol.

    Si no hay `api_key` (ni en el parametro ni en OPENAI_API_KEY), devuelve un
    fallback simple (glosas unidas con espacios, capitalizadas) en vez de
    lanzar una excepcion, para que el pipeline nunca se bloquee por falta de
    API key.
    """
    cleaned = [g.strip() for g in glosses if g and g.strip()]
    if not cleaned:
        return ""

    key = api_key or os.environ.get("OPENAI_API_KEY", "")
    if not key:
        return _fallback_join(cleaned)

    payload = {
        "model": model,
        "temperature": 0.2,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": " ".join(cleaned)},
        ],
    }
    request = urllib.request.Request(
        OPENAI_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {key}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise InterpreteLLMError(f"OpenAI HTTP {e.code}: {detail}") from e
    except urllib.error.URLError as e:
        raise InterpreteLLMError(f"No se pudo conectar a OpenAI: {e}") from e

    try:
        content = body["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, AttributeError) as e:
        raise InterpreteLLMError(f"Respuesta inesperada de OpenAI: {body}") from e

    return content or _fallback_join(cleaned)


def _fallback_join(glosses: list[str]) -> str:
    """Union simple sin LLM: capitaliza y junta las glosas con espacios."""
    text = " ".join(g.replace("_", " ").lower() for g in glosses)
    return text[:1].upper() + text[1:] if text else ""


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "glosses",
        nargs="*",
        help="Secuencia de glosas detectadas, en orden (ej: YO QUERER PEDIR CAFE)",
    )
    parser.add_argument(
        "--stdin",
        action="store_true",
        help="Leer las glosas (separadas por espacios) desde stdin en vez de argumentos",
    )
    parser.add_argument(
        "--model",
        default=DEFAULT_MODEL,
        help=f"Modelo de OpenAI a usar (default: {DEFAULT_MODEL})",
    )
    args = parser.parse_args()

    if args.stdin:
        glosses = sys.stdin.read().split()
    else:
        glosses = args.glosses

    if not glosses:
        parser.error("No se proporcionaron glosas (usa argumentos o --stdin)")

    try:
        result = interpret_signs(glosses, model=args.model)
    except InterpreteLLMError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    print(result)
    return 0


if __name__ == "__main__":
    sys.exit(main())
