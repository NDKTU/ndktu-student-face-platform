import { useMutation } from '@tanstack/react-query';
import {
    quizProcessService,
    type StartQuizRequest,
    type SubmitAnswerRequest,
    type EndQuizRequest,
} from '@/services/quizProcessService';

export const useStartQuiz = () => {
    return useMutation({
        mutationFn: (data: StartQuizRequest) => quizProcessService.startQuiz(data),
    });
};

export const useSubmitAnswer = () => {
    return useMutation({
        mutationFn: (data: SubmitAnswerRequest) => quizProcessService.submitAnswer(data),
    });
};

export const useEndQuiz = () => {
    return useMutation({
        mutationFn: (data: EndQuizRequest) => quizProcessService.endQuiz(data),
    });
};
