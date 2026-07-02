from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS
import logging

import agents
import utils

# =====================================================
# LOGGING
# =====================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(message)s"
)

logger = logging.getLogger(__name__)

# =====================================================
# APP INIT
# =====================================================

app = Flask(__name__)

# Enable CORS for all origins
CORS(
    app,
    resources={
        r"/api/*": {
            "origins": "*"
        }
    }
)

# =====================================================
# API : GET MODELS
# =====================================================

@app.route("/api/models", methods=["GET"])
def get_models():

    logger.info("[API HIT] /api/models")

    models = utils.get_models()

    return jsonify({
        "models": models
    })


# =====================================================
# API : CHAT
# =====================================================

@app.route("/api/chat", methods=["POST"])
def chat():

    logger.info("[API HIT] /api/chat")

    data = request.get_json() or {}

    message = data.get("message")
    model = data.get("model")
    workspace = data.get("workspaceFolder")
    history = data.get("history", [])
    images = data.get("images", [])

    logger.info(f"Model : {model}")
    logger.info(f"Message : {message}")
    logger.info(f"Workspace : {workspace}")
    logger.info(f"History Count : {len(history)}")
    logger.info(f"Images Count : {len(images)}")

    logger.info("[AGENT CALL]")

    return Response(

        stream_with_context(

            agents.stream(
                message=message,
                model=model,
                workspace=workspace,
                history=history,
                images=images
            )

        ),

        mimetype="application/x-ndjson",

        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }

    )


# =====================================================
# MAIN
# =====================================================

if __name__ == "__main__":

    logger.info("========================================")
    logger.info("AI AGENT BACKEND STARTED")
    logger.info("HOST : 0.0.0.0")
    logger.info("PORT : 5000")
    logger.info("========================================")

    app.run(
        host="0.0.0.0",
        port=5000,
        threaded=True,
        debug=True
    )