export interface RecordedVoiceData {
  audioBlob: Blob;
  base64Data: string;
  durationSeconds: number;
  mimeType: string;
}

export class VoiceRecorderService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioStream: MediaStream | null = null;
  private audioChunks: Blob[] = [];
  private startTime = 0;
  private isRecording = false;

  public async start(): Promise<void> {
    if (this.isRecording) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone access is not supported in this environment');
    }

    // Explicit mic permission request
    this.audioStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    this.audioChunks = [];
    this.startTime = Date.now();

    // Prefer Opus codec
    let options: MediaRecorderOptions = {};
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
      options = { mimeType: 'audio/webm;codecs=opus' };
    } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
      options = { mimeType: 'audio/ogg;codecs=opus' };
    }

    this.mediaRecorder = new MediaRecorder(this.audioStream, options);

    this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };

    this.mediaRecorder.start(100); // 100ms slices
    this.isRecording = true;
  }

  public stop(): Promise<RecordedVoiceData> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || !this.isRecording) {
        reject(new Error('Recorder is not active'));
        return;
      }

      const durationSeconds = Math.max(1, Math.round((Date.now() - this.startTime) / 1000));

      this.mediaRecorder.onstop = async () => {
        const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
        const audioBlob = new Blob(this.audioChunks, { type: mimeType });

        // Convert to Base64 for transport
        const arrayBuffer = await audioBlob.arrayBuffer();
        let binary = '';
        const bytes = new Uint8Array(arrayBuffer);
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64Data = btoa(binary);

        // Hardware cleanup - release mic immediately
        this.cleanup();

        resolve({
          audioBlob,
          base64Data,
          durationSeconds,
          mimeType,
        });
      };

      this.mediaRecorder.stop();
      this.isRecording = false;
    });
  }

  public cancel(): void {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.isRecording = false;
    }
    this.cleanup();
  }

  private cleanup(): void {
    if (this.audioStream) {
      this.audioStream.getTracks().forEach((track) => track.stop());
      this.audioStream = null;
    }
    this.audioChunks = [];
    this.mediaRecorder = null;
    this.isRecording = false;
  }

  public getIsRecording(): boolean {
    return this.isRecording;
  }
}
