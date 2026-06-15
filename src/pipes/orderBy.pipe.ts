import {Pipe, PipeTransform} from "@angular/core";

@Pipe({ name: "orderBy" })
export class ArraySortPipe implements PipeTransform {
  transform<T>(array: T[] | null | undefined, field: keyof T): T[] {
    if (!Array.isArray(array)) {
      return [];
    }
    // Sort a copy: a pipe must not mutate its input array.
    return [...array].sort((a, b) => {
      if (a[field] < b[field]) {
        return -1;
      } else if (a[field] > b[field]) {
        return 1;
      } else {
        return 0;
      }
    });
  }
}
