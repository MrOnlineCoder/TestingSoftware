<script setup lang="ts">
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import Dialog from 'primevue/dialog';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import { computed, ref, watch } from 'vue';
import type { ExamSession } from '@/api/types';
import { useExamSessionsStore } from '@/stores/examSessions';
import { examUrl } from '@/utils/format';
import { useApiError } from '@/utils/useApiError';
import CopyField from './CopyField.vue';

const props = defineProps<{ collectionId: string; collectionTitle: string }>();
const visible = defineModel<boolean>('visible', { required: true });
const emit = defineEmits<{ created: [session: ExamSession] }>();

const sessions = useExamSessionsStore();
const showApiError = useApiError();

const studentName = ref('');
const studentId = ref('');
const allowNavigation = ref(true);
const showCorrectAnswer = ref(false);
const showScore = ref(true);
const timeLimit = ref<number | null>(null);
const creating = ref(false);
const created = ref<ExamSession | null>(null);

const isLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
const url = computed(() => (created.value ? examUrl(created.value.id) : ''));
const lanExample = computed(() => {
  const port = window.location.port ? `:${window.location.port}` : '';
  return `${window.location.protocol}//192.168.x.x${port}/exam/${created.value?.id ?? ''}`;
});

watch(visible, (open) => {
  if (open) {
    // keep the chosen settings between students, only reset the person
    studentName.value = '';
    studentId.value = '';
    created.value = null;
  }
});

async function create() {
  if (!studentName.value.trim()) return;
  creating.value = true;
  try {
    created.value = await sessions.create({
      collectionId: props.collectionId,
      studentName: studentName.value.trim(),
      studentId: studentId.value.trim() || null,
      settings: {
        allowNavigation: allowNavigation.value,
        showCorrectAnswer: showCorrectAnswer.value,
        showScore: showScore.value,
        timeLimitMinutes: timeLimit.value && timeLimit.value > 0 ? timeLimit.value : null,
      },
    });
    emit('created', created.value);
  } catch (e) {
    showApiError(e, 'Не вдалося створити сесію іспиту');
  } finally {
    creating.value = false;
  }
}

function another() {
  created.value = null;
  studentName.value = '';
  studentId.value = '';
}
</script>

<template>
  <Dialog v-model:visible="visible" :header="created ? 'Сесію іспиту створено' : 'Розпочати сесію іспиту'" modal :style="{ width: '36rem' }">
    <form v-if="!created" class="col form" @submit.prevent="create">
      <p class="muted small" style="margin: 0">{{ collectionTitle }}</p>
      <div class="row row-wrap two">
        <div class="field grow">
          <label for="studentName">Імʼя студента</label>
          <InputText id="studentName" v-model="studentName" autofocus fluid />
        </div>
        <div class="field grow">
          <label for="studentId">ID студента <span class="muted small">(необовʼязково)</span></label>
          <InputText id="studentId" v-model="studentId" fluid />
        </div>
      </div>
      <div class="checks">
        <label class="check">
          <Checkbox v-model="allowNavigation" binary />
          <span>
            <strong>Дозволити навігацію</strong>
            <span class="muted small">Студент може пропускати питання та повертатися до попередніх.</span>
          </span>
        </label>
        <label class="check">
          <Checkbox v-model="showCorrectAnswer" binary />
          <span>
            <strong>Одразу показувати правильні відповіді</strong>
            <span class="muted small">Після відповіді її не можна змінити, і студент бачить правильну (також на сторінці результатів).</span>
          </span>
        </label>
        <label class="check">
          <Checkbox v-model="showScore" binary />
          <span>
            <strong>Показувати підсумковий бал</strong>
            <span class="muted small">Студент бачить бал на сторінці результатів.</span>
          </span>
        </label>
      </div>
      <div class="field">
        <label for="timeLimit">Обмеження часу, хвилин <span class="muted small">(необовʼязково)</span></label>
        <InputNumber id="timeLimit" v-model="timeLimit" :min="1" :max="1440" :use-grouping="false" placeholder="Без обмеження" show-buttons />
      </div>
      <div class="row" style="justify-content: flex-end">
        <Button label="Скасувати" severity="secondary" text @click="visible = false" />
        <Button type="submit" label="Створити сесію" icon="pi pi-play" :loading="creating" :disabled="!studentName.trim()" />
      </div>
    </form>

    <div v-else class="col form">
      <p style="margin: 0">
        Передайте це посилання студенту <strong>{{ created.studentName }}</strong>. Іспит розпочнеться, коли студент натисне «Почати».
      </p>
      <CopyField :value="url" />
      <Message v-if="isLocalhost" severity="info" size="small">
        Інші пристрої в локальній мережі мають використовувати IP-адресу цього компʼютера замість
        <code>localhost</code>, напр. <code>{{ lanExample }}</code>.
      </Message>
      <div class="row" style="justify-content: flex-end">
        <Button label="Створити ще одну" icon="pi pi-plus" severity="secondary" outlined @click="another" />
        <Button label="Переглянути сесію" icon="pi pi-arrow-right" icon-pos="right" as="router-link" :to="{ name: 'session', params: { id: created.id } }" />
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.form {
  gap: 1rem;
}

.two {
  gap: 1rem;
}

.checks {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.check {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  cursor: pointer;
}

.check > span {
  display: flex;
  flex-direction: column;
}
</style>
