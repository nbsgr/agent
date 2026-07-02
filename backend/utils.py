import ollama
import logging

# =====================================================
# CONFIG
# =====================================================

OLLAMA_MODELS_API = "http://localhost:11434/api/tags"

# =====================================================
# LOGGING
# =====================================================

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(message)s')
logger = logging.getLogger(__name__)


def get_models():
    logger.info("[UTILS] get_models called")
    models = []

    try:
        response = ollama.list()
        for model in response.models:
            models.append(model.model)
        logger.info(f"[UTILS] Ollama models: {models}")
    except Exception as e:
        logger.warning(f"[UTILS] Failed to fetch Ollama models: {e}")

    models.append("llm7")
    logger.info(f"[UTILS] All models: {models}")
    return models


def get_provider_for_model(model):

    if model == "llm7":
        return "cloud"

    return "ollama"