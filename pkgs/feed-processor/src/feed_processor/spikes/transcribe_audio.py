import os

from dotenv import load_dotenv
from groq import Groq

load_dotenv()

client = Groq()
filename = os.path.dirname(__file__) + "/recording.webm"

with open(filename, "rb") as file:
    transcription = client.audio.transcriptions.create(
      file=(filename, file.read()),
      model="whisper-large-v3-turbo",
      response_format="verbose_json",
    )
    print(transcription.text)

