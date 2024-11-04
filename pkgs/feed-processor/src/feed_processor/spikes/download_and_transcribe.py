import os

from dotenv import load_dotenv
from feed_processor.supabase import create_service_role_client
from groq import Groq

load_dotenv()

client = Groq()
filename = os.path.dirname(__file__) + "/recording.webm"

supabase = create_service_role_client()

response = supabase.storage.from_("feed_recordings").download('recording-503c0187-bc83-4891-82e3-76ce43548dda.webm');
transcription = client.audio.transcriptions.create(
  file=(filename, response),
  model="whisper-large-v3-turbo",
  response_format="verbose_json",
)
print(transcription.text)
