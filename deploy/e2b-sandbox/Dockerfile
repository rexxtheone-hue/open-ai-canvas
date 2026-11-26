FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive PIP_BREAK_SYSTEM_PACKAGES=1 PIP_NO_CACHE_DIR=1
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip jq curl ca-certificates fonts-dejavu-core fonts-noto-cjk imagemagick sox zip unzip git && rm -rf /var/lib/apt/lists/*
RUN pip install --index-url https://download.pytorch.org/whl/cpu torch torchaudio
RUN pip install --only-binary=av faster-whisper demucs numpy soundfile pillow fonttools "av>=13,<19"
ENV HF_HOME=/opt/hf TORCH_HOME=/opt/torch
RUN python3 -c "from faster_whisper import WhisperModel as W; W('small', device='cpu', compute_type='int8'); W('medium', device='cpu', compute_type='int8')"
RUN python3 -c "from demucs.pretrained import get_model; get_model('htdemucs')"
COPY workflows /opt/workflows
RUN bash /opt/workflows/video-montage/scripts/fetch_fonts.sh || true
RUN mkdir -p /opt/torch /home/user && chmod -R a+rX /opt/hf /opt/torch /opt/workflows
COPY omnimuse.sh /etc/profile.d/omnimuse.sh
RUN cat /etc/profile.d/omnimuse.sh >> /etc/bash.bashrc && chmod a+r /etc/profile.d/omnimuse.sh
