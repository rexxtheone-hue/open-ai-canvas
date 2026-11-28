FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive PIP_BREAK_SYSTEM_PACKAGES=1 PIP_NO_CACHE_DIR=1
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip jq curl ca-certificates fonts-dejavu-core fonts-noto-cjk imagemagick sox zip unzip git nodejs npm && rm -rf /var/lib/apt/lists/*
RUN pip install --index-url https://download.pytorch.org/whl/cpu torch torchaudio
RUN pip install --only-binary=av faster-whisper demucs numpy soundfile pillow fonttools "av>=13,<19"
ENV HF_HOME=/opt/hf TORCH_HOME=/opt/torch
RUN python3 -c "from faster_whisper import WhisperModel as W; W('small', device='cpu', compute_type='int8'); W('medium', device='cpu', compute_type='int8')"
RUN python3 -c "from demucs.pretrained import get_model; get_model('htdemucs')"
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright NODE_PATH=/usr/local/lib/node_modules
RUN npm install -g playwright@1.49.1 && playwright install --with-deps chromium && chmod -R a+rX /ms-playwright && rm -rf /var/lib/apt/lists/* /root/.npm
COPY workflows /opt/workflows
RUN bash /opt/workflows/video-montage/scripts/fetch_fonts.sh || true
RUN mkdir -p /opt/torch /home/user && chmod -R a+rX /opt/hf /opt/torch /opt/workflows
RUN printf '\n# OmniMuse: Cloudflare blocks the default Python-urllib User-Agent on omnimuse.io result links\nimport urllib.request as _om_u\n_om_o = _om_u.build_opener()\n_om_o.addheaders = [("User-Agent", "Mozilla/5.0 (X11; Linux x86_64) OmniMuseSandbox/1.0")]\n_om_u.install_opener(_om_o)\n' >> /etc/python3.12/sitecustomize.py
COPY omnimuse.sh /etc/profile.d/omnimuse.sh
RUN cat /etc/profile.d/omnimuse.sh >> /etc/bash.bashrc && chmod a+r /etc/profile.d/omnimuse.sh
