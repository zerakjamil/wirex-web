import { useAcademyStore } from '@/store/academyStore'
import { useTrainingStore } from '@/store/trainingStore'
import type { LessonId } from '@/simulator/trainingLabs'

export function startGuidedLab(lesson: LessonId) {
  useAcademyStore.getState().closeAcademy()
  useTrainingStore.getState().start(lesson, 'guided')
}
