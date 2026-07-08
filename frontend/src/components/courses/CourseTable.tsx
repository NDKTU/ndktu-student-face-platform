import { Pencil, Trash2, Loader2 } from 'lucide-react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/Table';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { ExpandableTags } from '@/components/ui/ExpandableTags';
import type { Course } from '@/services/courseService';

interface CourseTableProps {
    courses: Course[];
    isLoading: boolean;
    onEdit: (course: Course) => void;
    onDelete: (course: Course) => void;
}

export const CourseTable = ({ courses, isLoading, onEdit, onDelete }: CourseTableProps) => {
    return (
        <Card>
            <CardContent className="pt-6">
                {isLoading ? (
                    <div className="flex justify-center p-8">
                        <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[80px]">ID</TableHead>
                                <TableHead>Nomi</TableHead>
                                <TableHead>Fan</TableHead>
                                <TableHead>O'qituvchi</TableHead>
                                <TableHead>Semestr</TableHead>
                                <TableHead>Guruhlar</TableHead>
                                <TableHead className="text-right">Amallar</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {courses.map((course) => (
                                <TableRow key={course.id}>
                                    <TableCell>{course.id}</TableCell>
                                    <TableCell className="font-medium">{course.name}</TableCell>
                                    <TableCell>{course.subject?.name || '-'}</TableCell>
                                    <TableCell>{course.teacher?.full_name || '-'}</TableCell>
                                    <TableCell>{course.semester_number ?? '-'}</TableCell>
                                    <TableCell>
                                        <ExpandableTags
                                            items={course.groups.map(g => ({ id: g.id, name: g.name }))}
                                            limit={3}
                                        />
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <PermissionGate permission="update:course">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => onEdit(course)}
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                            </PermissionGate>
                                            <PermissionGate permission="delete:course">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-destructive hover:text-destructive"
                                                    onClick={() => onDelete(course)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </PermissionGate>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {courses.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                                        Kurslar topilmadi.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    );
};
