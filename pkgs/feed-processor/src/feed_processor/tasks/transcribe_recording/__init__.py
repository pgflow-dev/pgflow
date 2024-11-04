import json

from feed_processor.models import JobContext
from groq import Groq
from pgqueuer.models import Job
from pydantic import BaseModel


class JobPayload(BaseModel):
    object_id: str
    object_name: str
    bucket_id: str
    owner_id: str

    @classmethod
    def from_job(cls, job: Job):
        assert job.payload, "No payload in job"

        return cls(**json.loads(job.payload.decode()))


from dotenv import load_dotenv

load_dotenv()
import os


async def transcribe_recording(job: Job, context: JobContext):
    job_payload = JobPayload.from_job(job)
    supabase = context.supabase
    filename = job_payload.object_name
    bucket = job_payload.bucket_id
    print('transcribing', dict(
        filename=filename,
        bucket=bucket,
        owner=job_payload.owner_id
    ))

    response = supabase.storage.from_(bucket).download(filename)
    client = Groq(api_key=os.environ['GROQ_API_KEY'])
    transcription = client.audio.transcriptions.create(
      file=(filename, response),
      model="whisper-large-v3-turbo",
      response_format="verbose_json",
    )
    print('transcribed', transcription.text)

    share = supabase.schema('feed').from_('shares').insert({
        'content': transcription.text,
        'owner_id': job_payload.owner_id
    }).execute()

    print('saved a share', share)
